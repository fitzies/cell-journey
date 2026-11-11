import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  asUser,
  makeTest,
  resetBackendTestState,
  seedAdmin,
  seedEvent,
  seedGroup,
  seedMembership,
  seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 11, 12);

type TestClient = ReturnType<typeof makeTest>;

async function mark(
  t: TestClient,
  eventId: Id<"events">,
  groupId: Id<"groups">,
  profileId: Id<"userProfiles">,
  status: "present" | "absent",
) {
  await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_profile_group", (q) => q.eq("profileId", profileId).eq("groupId", groupId))
      .first();
    await ctx.db.insert("attendance", {
      eventId,
      groupId,
      profileId,
      membershipId: membership!._id,
      finalStatus: status,
      finalizedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
}

describe("dashboard attendance statistics", () => {
  test("per-member breakdown lines up with events and group totals", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = makeTest();
    const admin = await seedAdmin(t);
    const owner = await seedProfile(t, "Owner");
    const alice = await seedProfile(t, "Alice");
    const bob = await seedProfile(t, "Bob");
    const late = await seedProfile(t, "Late");
    const groupId = await seedGroup(t, owner.profileId, "STATS1");
    await seedMembership(t, alice.profileId, groupId, "active", NOW - 60 * DAY);
    await seedMembership(t, bob.profileId, groupId, "active", NOW - 60 * DAY);
    // Joins after the first event, so it should not count against them.
    await seedMembership(t, late.profileId, groupId, "active", NOW - 10 * DAY);

    const first = await seedEvent(t, groupId, owner.profileId, NOW - 14 * DAY, NOW - 14 * DAY + 7200_000, {
      title: "First",
    });
    const second = await seedEvent(t, groupId, owner.profileId, NOW - 7 * DAY, NOW - 7 * DAY + 7200_000, {
      title: "Second",
    });
    await seedEvent(t, groupId, owner.profileId, NOW - 3 * DAY, NOW - 3 * DAY + 7200_000, { cancelled: true });
    await seedEvent(t, groupId, owner.profileId, NOW + DAY, NOW + DAY + 7200_000, { title: "Future" });

    await mark(t, first, groupId, alice.profileId, "present");
    await mark(t, first, groupId, bob.profileId, "absent");
    await mark(t, second, groupId, alice.profileId, "present");
    await mark(t, second, groupId, late.profileId, "present");
    // Bob is unmarked for the second event.

    const client = asUser(t, admin.userId);
    const range = { from: NOW - 30 * DAY, to: NOW };
    const detail = await client.query(api.admin.groupMemberAttendance, { groupId, ...range });
    expect(detail.events.map((event) => event.title)).toEqual(["First", "Second"]);

    const byName = Object.fromEntries(detail.members.map((member) => [member.displayName, member]));
    expect(byName.Alice).toMatchObject({
      present: 2,
      absent: 0,
      unmarked: 0,
      expected: 2,
      rate: 1,
      statuses: ["present", "present"],
      status: "active",
      lastPresentAt: NOW - 7 * DAY,
    });
    expect(byName.Bob).toMatchObject({
      present: 0,
      absent: 1,
      unmarked: 1,
      expected: 2,
      rate: 0,
      statuses: ["absent", "unmarked"],
      lastPresentAt: null,
    });
    expect(byName.Late).toMatchObject({
      present: 1,
      expected: 1,
      rate: 1,
      statuses: ["notMember", "present"],
    });
    // Sorted by rate, highest first.
    expect(detail.members.at(-1)?.displayName).toBe("Bob");
    expect(detail.totals).toMatchObject({ present: 3, expected: 5 });

    const page = await client.query(api.admin.listGroupAttendance, {
      ...range,
      paginationOpts: { numItems: 10, cursor: null },
    });
    const row = page.page.find((entry) => entry.group._id === groupId)!;
    expect(row).toMatchObject({ presentCount: 3, expectedCount: 5, eventCount: 2 });
    const memberStatSums = row.memberStats.reduce(
      (sum, stat) => ({ present: sum.present + stat.present, expected: sum.expected + stat.expected }),
      { present: 0, expected: 0 },
    );
    expect(memberStatSums).toEqual({ present: row.presentCount, expected: row.expectedCount });
    expect(row.memberStats.find((stat) => stat.profileId === late.profileId)).toEqual({
      profileId: late.profileId,
      present: 1,
      expected: 1,
    });
  });

  test("members who left keep their history as former members", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = makeTest();
    const admin = await seedAdmin(t);
    const owner = await seedProfile(t, "Owner");
    const leaver = await seedProfile(t, "Leaver");
    const groupId = await seedGroup(t, owner.profileId, "STATS2");
    const membershipId = await seedMembership(t, leaver.profileId, groupId, "active", NOW - 60 * DAY, NOW - 5 * DAY);
    await t.run((ctx) => ctx.db.patch(membershipId, { status: "left", endedAt: NOW - 5 * DAY }));
    const eventId = await seedEvent(t, groupId, owner.profileId, NOW - 10 * DAY, NOW - 10 * DAY + 3600_000);
    await mark(t, eventId, groupId, leaver.profileId, "present");

    const detail = await asUser(t, admin.userId).query(api.admin.groupMemberAttendance, {
      groupId,
      from: NOW - 30 * DAY,
      to: NOW,
    });
    expect(detail.members).toMatchObject([{ displayName: "Leaver", status: "former", present: 1, expected: 1 }]);
  });
});

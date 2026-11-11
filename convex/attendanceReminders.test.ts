import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  asUser,
  makeTest,
  resetBackendTestState,
  seedEvent,
  seedGroup,
  seedMembership,
  seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 11, 12);

type TestClient = ReturnType<typeof makeTest>;

async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const coLeader = await seedProfile(t, "Co");
  const outsider = await seedProfile(t, "Outsider");
  const alice = await seedProfile(t, "Alice");
  const bob = await seedProfile(t, "Bob");
  const groupId = await seedGroup(t, owner.profileId, "REMIND");
  await seedMembership(t, alice.profileId, groupId, "active", NOW - 1000 * HOUR);
  await seedMembership(t, bob.profileId, groupId, "active", NOW - 1000 * HOUR);
  await t.run((ctx) =>
    ctx.db.insert("coLeaderAssignments", {
      groupId,
      profileId: coLeader.profileId,
      status: "active",
      assignedAt: NOW,
      assignedByKind: "developer",
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
  await asUser(t, owner.userId).mutation(api.notifications.registerPushToken, {
    token: "ExponentPushToken[owner]",
    platform: "ios",
  });
  await asUser(t, coLeader.userId).mutation(api.notifications.registerPushToken, {
    token: "ExponentPushToken[co]",
    platform: "android",
  });
  await asUser(t, outsider.userId).mutation(api.notifications.registerPushToken, {
    token: "ExponentPushToken[outsider]",
    platform: "ios",
  });
  return { t, owner, coLeader, alice, bob, groupId };
}

async function mark(
  t: TestClient,
  eventId: Id<"events">,
  groupId: Id<"groups">,
  profileId: Id<"userProfiles">,
) {
  await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_profile_and_group_and_status", (q) =>
        q.eq("profileId", profileId).eq("groupId", groupId).eq("status", "active"),
      )
      .unique();
    await ctx.db.insert("attendance", {
      eventId,
      groupId,
      profileId,
      membershipId: membership!._id,
      finalStatus: "absent",
      finalizedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
}

async function pushJobs(t: TestClient) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((job) => job.name.includes("sendPushMessages"));
}

async function checked(t: TestClient, eventId: Id<"events">) {
  return (await t.run((ctx) => ctx.db.get(eventId)))?.attendanceReminderCheckedAt;
}

describe("attendance reminders", () => {
  test("3h after the end, owner and co-leaders hear about unmarked people once", async () => {
    const { t, owner, alice, groupId } = await setup();
    const tooRecent = await seedEvent(t, groupId, owner.profileId, NOW - 4 * HOUR, NOW - 2 * HOUR, {
      title: "Too recent",
    });
    const due = await seedEvent(t, groupId, owner.profileId, NOW - 6 * HOUR, NOW - 4 * HOUR, {
      title: "Cell night",
    });
    await mark(t, due, groupId, alice.profileId);

    const result = await t.mutation(internal.notifications.checkAttendanceReminders, {});
    expect(result).toEqual({ checked: 1, sent: 2 });
    expect(await checked(t, tooRecent)).toBeUndefined();
    expect(await checked(t, due)).toBe(NOW);

    const jobs = await pushJobs(t);
    expect(jobs).toHaveLength(1);
    const messages = jobs[0].args[0].messages as Array<{ to: string; title: string; body: string; data: unknown }>;
    expect(messages.map((message) => message.to).sort()).toEqual([
      "ExponentPushToken[co]",
      "ExponentPushToken[owner]",
    ]);
    expect(messages[0]).toMatchObject({
      title: "Mark attendance for Cell night",
      body: "1 person is still unmarked in Group REMIND.",
      data: { type: "attendanceReminder", eventId: due, groupId },
    });

    // A second run sends nothing new.
    expect(await t.mutation(internal.notifications.checkAttendanceReminders, {})).toEqual({ checked: 0, sent: 0 });
    expect(await pushJobs(t)).toHaveLength(1);
  });

  test("the body counts every unmarked person", async () => {
    const { t, owner, groupId } = await setup();
    await seedEvent(t, groupId, owner.profileId, NOW - 6 * HOUR, NOW - 4 * HOUR, { title: "Cell night" });
    await t.mutation(internal.notifications.checkAttendanceReminders, {});
    const [job] = await pushJobs(t);
    expect(job.args[0].messages[0].body).toBe("2 people are still unmarked in Group REMIND.");
  });

  test("fully marked, cancelled and old events send nothing", async () => {
    const { t, owner, alice, bob, groupId } = await setup();
    const complete = await seedEvent(t, groupId, owner.profileId, NOW - 6 * HOUR, NOW - 4 * HOUR);
    await mark(t, complete, groupId, alice.profileId);
    await mark(t, complete, groupId, bob.profileId);
    const cancelled = await seedEvent(t, groupId, owner.profileId, NOW - 6 * HOUR, NOW - 5 * HOUR, {
      cancelled: true,
    });
    const old = await seedEvent(t, groupId, owner.profileId, NOW - 40 * HOUR, NOW - 28 * HOUR);

    const result = await t.mutation(internal.notifications.checkAttendanceReminders, {});
    expect(result).toEqual({ checked: 2, sent: 0 });
    expect(await checked(t, complete)).toBe(NOW);
    expect(await checked(t, cancelled)).toBe(NOW);
    expect(await checked(t, old)).toBeUndefined();
    expect(await pushJobs(t)).toEqual([]);
  });

  test("inactive push tokens are skipped", async () => {
    const { t, owner, coLeader, groupId } = await setup();
    await asUser(t, coLeader.userId).mutation(api.notifications.unregisterPushToken, {
      token: "ExponentPushToken[co]",
    });
    await seedEvent(t, groupId, owner.profileId, NOW - 6 * HOUR, NOW - 4 * HOUR);
    await t.mutation(internal.notifications.checkAttendanceReminders, {});
    const [job] = await pushJobs(t);
    expect(job.args[0].messages.map((message: { to: string }) => message.to)).toEqual([
      "ExponentPushToken[owner]",
    ]);
  });

  test("moving an event's end time resets the check", async () => {
    const { t, owner, groupId } = await setup();
    const eventId = await seedEvent(t, groupId, owner.profileId, NOW - 6 * HOUR, NOW - 4 * HOUR, {
      title: "Moved",
    });
    await t.mutation(internal.notifications.checkAttendanceReminders, {});
    expect(await checked(t, eventId)).toBe(NOW);

    const ownerClient = asUser(t, owner.userId);
    await ownerClient.mutation(api.events.update, {
      eventId,
      title: "Moved, renamed",
      startAt: NOW - 6 * HOUR,
      endAt: NOW - 4 * HOUR,
    });
    expect(await checked(t, eventId)).toBe(NOW);

    await ownerClient.mutation(api.events.update, {
      eventId,
      title: "Moved",
      startAt: NOW - 6 * HOUR,
      endAt: NOW - 5 * HOUR,
    });
    expect(await checked(t, eventId)).toBeUndefined();
  });
});

describe("push tokens", () => {
  test("junk tokens are rejected and a device moves to whoever signs in", async () => {
    const { t, owner, alice } = await setup();
    await expect(
      asUser(t, alice.userId).mutation(api.notifications.registerPushToken, { token: "nope", platform: "ios" }),
    ).rejects.toThrow("Invalid push token");

    await asUser(t, alice.userId).mutation(api.notifications.registerPushToken, {
      token: "ExponentPushToken[owner]",
      platform: "ios",
    });
    const rows = await t.run((ctx) =>
      ctx.db.query("pushTokens").withIndex("by_token", (q) => q.eq("token", "ExponentPushToken[owner]")).collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].profileId).toBe(alice.profileId);

    // The previous owner can no longer deactivate it.
    await asUser(t, owner.userId).mutation(api.notifications.unregisterPushToken, {
      token: "ExponentPushToken[owner]",
    });
    expect((await t.run((ctx) => ctx.db.get(rows[0]._id)))?.isActive).toBe(true);
    await asUser(t, alice.userId).mutation(api.notifications.unregisterPushToken, {
      token: "ExponentPushToken[owner]",
    });
    expect((await t.run((ctx) => ctx.db.get(rows[0]._id)))?.isActive).toBe(false);
  });

  test("DeviceNotRegistered tokens are deactivated", async () => {
    const { t } = await setup();
    await t.mutation(internal.notifications.deactivateTokens, { tokens: ["ExponentPushToken[co]"] });
    const row = await t.run((ctx) =>
      ctx.db.query("pushTokens").withIndex("by_token", (q) => q.eq("token", "ExponentPushToken[co]")).first(),
    );
    expect(row?.isActive).toBe(false);
  });
});

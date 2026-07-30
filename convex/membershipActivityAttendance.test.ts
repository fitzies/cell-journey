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

describe("membership activity, optional attendance, and worklists", () => {
  test("inactive/reactivate transitions preserve half-open boundaries and stable IDs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const member = await seedProfile(t, "Member");
    const groupId = await seedGroup(t, owner.profileId, "PERIOD");
    const membershipId = await seedMembership(t, member.profileId, groupId, "active", 100);
    const ownerClient = asUser(t, owner.userId);

    await ownerClient.mutation(api.groups.markMemberInactive, { groupId, membershipId });
    vi.setSystemTime(2_000_000);
    await ownerClient.mutation(api.groups.reactivateMember, { groupId, membershipId });

    const state = await t.run(async (ctx) => ({
      membership: await ctx.db.get(membershipId),
      periods: await ctx.db
        .query("membershipActivityPeriods")
        .withIndex("by_membership_and_startedAt", (q) => q.eq("membershipId", membershipId))
        .take(10),
    }));
    expect(state.membership).toMatchObject({ _id: membershipId, status: "active" });
    expect(state.periods.map((period) => [period.startedAt, period.endedAt])).toEqual([
      [100, 1_000_000],
      [2_000_000, undefined],
    ]);

    const atStart = await seedEvent(t, groupId, owner.profileId, 100, 101, { title: "At start" });
    await seedEvent(t, groupId, owner.profileId, 1_000_000, 1_000_001, { title: "At end" });
    await seedEvent(t, groupId, owner.profileId, 2_000_000, 2_000_001, { title: "At restart" });
    vi.setSystemTime(3_000_000);
    const history = await asUser(t, member.userId).query(api.attendance.historyForGroup, {
      groupId,
    });
    expect(history.totalPastEvents).toBe(2);
    expect(history.rows.map((row) => row.event._id)).toContain(atStart);
    expect(history.rows.map((row) => row.event.title)).not.toContain("At end");
  });

  test("leaving ends a relationship and an approved rejoin creates a new one", async () => {
    const t = makeTest();
    const serviceId = await t.run((ctx) =>
      ctx.db.insert("services", {
        name: "Sunday",
        sortOrder: 0,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const owner = await seedProfile(t, "Owner");
    const member = await seedProfile(t, "Member", { serviceId });
    const groupId = await seedGroup(t, owner.profileId, "REJOIN");
    const originalId = await seedMembership(t, member.profileId, groupId);

    await asUser(t, member.userId).mutation(api.groups.leaveGroup, { groupId });
    const request = await asUser(t, member.userId).mutation(api.groups.requestToJoinByCode, {
      code: "REJOIN",
    });
    const replacement = await asUser(t, owner.userId).mutation(
      api.groups.approveJoinRequest,
      { joinRequestId: request!._id },
    );
    expect(replacement?._id).not.toBe(originalId);
    const relationships = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_profile_group", (q) =>
          q.eq("profileId", member.profileId).eq("groupId", groupId),
        )
        .take(10),
    );
    expect(relationships.map((row) => row.status).sort()).toEqual(["active", "left"]);
  });

  test("inactive attendance is optional present-only, clearable, and excluded from rates", async () => {
    const t = makeTest();
    const now = Date.now();
    const admin = await seedAdmin(t);
    const owner = await seedProfile(t, "Owner");
    const inactive = await seedProfile(t, "Inactive");
    const groupId = await seedGroup(t, owner.profileId, "OPTION");
    await seedMembership(
      t,
      inactive.profileId,
      groupId,
      "inactive",
      now - 200_000,
      now - 150_000,
    );
    const eventId = await seedEvent(
      t,
      groupId,
      owner.profileId,
      now - 20_000,
      now - 10_000,
    );
    const ownerClient = asUser(t, owner.userId);

    await expect(
      ownerClient.mutation(api.attendance.markForMember, {
        eventId,
        profileId: inactive.profileId,
        status: "absent",
      }),
    ).rejects.toThrow("can only be marked present");
    await ownerClient.mutation(api.attendance.markForMember, {
      eventId,
      profileId: inactive.profileId,
      status: "present",
    });
    const detail = await ownerClient.query(api.attendance.eventDetail, { eventId });
    expect(detail).toMatchObject({ requiredCount: 0, markedRequiredCount: 0, isComplete: true });
    expect(detail.rows[0]).toMatchObject({ eligibility: "optional", effectiveStatus: "present" });
    const history = await asUser(t, inactive.userId).query(api.attendance.historyForGroup, {
      groupId,
    });
    expect(history).toMatchObject({ totalPastEvents: 0, presentEvents: 0, attendanceRate: null });
    expect(
      (await ownerClient.query(api.attendance.attendanceWorklist, { groupId, now })).rows,
    ).toHaveLength(0);
    const adminTotals = await asUser(t, admin.userId).query(
      api.admin.listGroupAttendance,
      {
        from: now - 24 * 60 * 60 * 1000,
        to: now,
        paginationOpts: { numItems: 10, cursor: null },
      },
    );
    expect(adminTotals.page.find((row) => row.group._id === groupId)).toMatchObject({
      expectedCount: 0,
      presentCount: 0,
      attendanceRate: null,
    });
    await expect(
      asUser(t, inactive.userId).mutation(api.attendance.selfSubmit, { eventId }),
    ).rejects.toThrow("Inactive members cannot self-check in");

    await ownerClient.mutation(api.attendance.clearOptionalForMember, {
      eventId,
      profileId: inactive.profileId,
    });
    const corrected = await ownerClient.query(api.attendance.eventDetail, { eventId });
    expect(corrected.rows[0].effectiveStatus).toBeNull();
  });

  test("optional inactive attendance requires a current post-join relationship", async () => {
    const t = makeTest();
    const now = Date.now();
    const owner = await seedProfile(t, "Owner");
    const preJoin = await seedProfile(t, "PreJoin");
    const left = await seedProfile(t, "Left");
    const removed = await seedProfile(t, "Removed");
    const groupId = await seedGroup(t, owner.profileId, "OPTBOUND");
    await seedMembership(t, preJoin.profileId, groupId, "inactive", now - 10_000, now - 5_000);
    const leftId = await seedMembership(
      t,
      left.profileId,
      groupId,
      "inactive",
      now - 100_000,
      now - 50_000,
    );
    const removedId = await seedMembership(
      t,
      removed.profileId,
      groupId,
      "inactive",
      now - 100_000,
      now - 50_000,
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(leftId, { status: "left", endedAt: now - 50_000 });
      await ctx.db.patch(removedId, { status: "removed", endedAt: now - 50_000 });
    });
    const eventId = await seedEvent(
      t,
      groupId,
      owner.profileId,
      now - 20_000,
      now - 19_000,
    );
    const ownerClient = asUser(t, owner.userId);

    const detail = await ownerClient.query(api.attendance.eventDetail, { eventId });
    expect(detail.rows).toHaveLength(0);
    for (const profileId of [preJoin.profileId, left.profileId, removed.profileId]) {
      await expect(
        ownerClient.mutation(api.attendance.markForMember, {
          eventId,
          profileId,
          status: "present",
        }),
      ).rejects.toThrow("not eligible");
      await expect(
        ownerClient.mutation(api.attendance.clearOptionalForMember, {
          eventId,
          profileId,
        }),
      ).rejects.toThrow("Only optional inactive attendance can be cleared");
    }
  });

  test("leader and co-leader attendance writes reject future events but allow equality", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const t = makeTest();
    const admin = await seedAdmin(t);
    const owner = await seedProfile(t, "Owner");
    const coLeader = await seedProfile(t, "Co");
    const member = await seedProfile(t, "Member");
    const inactive = await seedProfile(t, "Inactive");
    const groupId = await seedGroup(t, owner.profileId, "FUTURE");
    await seedMembership(t, member.profileId, groupId, "active", 100);
    await seedMembership(t, inactive.profileId, groupId, "inactive", 100, 500);
    await asUser(t, admin.userId).mutation(api.admin.assignCoLeader, {
      groupId,
      profileId: coLeader.profileId,
    });
    const atNow = await seedEvent(t, groupId, owner.profileId, 1_000_000, 1_000_100);
    const future = await seedEvent(t, groupId, owner.profileId, 1_000_001, 1_000_100);
    const ownerClient = asUser(t, owner.userId);
    const coClient = asUser(t, coLeader.userId);

    for (const client of [ownerClient, coClient]) {
      await expect(
        client.mutation(api.attendance.markForMember, {
          eventId: future,
          profileId: member.profileId,
          status: "present",
        }),
      ).rejects.toThrow("future event");
      await expect(
        client.mutation(api.attendance.clearOptionalForMember, {
          eventId: future,
          profileId: inactive.profileId,
        }),
      ).rejects.toThrow("future event");
    }

    await expect(
      coClient.mutation(api.attendance.markForMember, {
        eventId: atNow,
        profileId: member.profileId,
        status: "present",
      }),
    ).resolves.toMatchObject({ finalStatus: "present" });
    await ownerClient.mutation(api.attendance.markForMember, {
      eventId: atNow,
      profileId: inactive.profileId,
      status: "present",
    });
    await expect(
      coClient.mutation(api.attendance.clearOptionalForMember, {
        eventId: atNow,
        profileId: inactive.profileId,
      }),
    ).resolves.toBeNull();
  });

  test("bounded worklist includes only incomplete started events and detail supports correction", async () => {
    const t = makeTest();
    const now = Date.now();
    const owner = await seedProfile(t, "Owner");
    const member = await seedProfile(t, "Member");
    const inactive = await seedProfile(t, "Inactive");
    const groupId = await seedGroup(t, owner.profileId, "WORK01");
    const membershipId = await seedMembership(t, member.profileId, groupId, "active", now - 500_000);
    await seedMembership(t, inactive.profileId, groupId, "inactive", now - 500_000, now - 400_000);

    const ongoing = await seedEvent(t, groupId, owner.profileId, now - 1_000, now + 50_000, {
      title: "Ongoing",
    });
    const past = await seedEvent(t, groupId, owner.profileId, now - 100_000, now - 90_000, {
      title: "Past incomplete",
    });
    const complete = await seedEvent(t, groupId, owner.profileId, now - 200_000, now - 190_000, {
      title: "Complete",
    });
    await seedEvent(t, groupId, owner.profileId, now + 100_000, now + 110_000, {
      title: "Future",
    });
    await seedEvent(t, groupId, owner.profileId, now - 300_000, now - 290_000, {
      title: "Cancelled",
      cancelled: true,
    });
    await t.run((ctx) =>
      ctx.db.insert("attendance", {
        eventId: complete,
        groupId,
        profileId: member.profileId,
        membershipId,
        finalStatus: "present",
        finalizedAt: now,
        finalizedByProfileId: owner.profileId,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const ownerClient = asUser(t, owner.userId);
    const worklist = await ownerClient.query(api.attendance.attendanceWorklist, {
      groupId,
      now,
      limit: 20,
    });
    expect(worklist.rows.map((row) => row.event._id).sort()).toEqual([ongoing, past].sort());
    expect(worklist.rows.find((row) => row.event._id === ongoing)?.phase).toBe("ongoing");
    expect(worklist.rows.every((row) => !row.isComplete)).toBe(true);
    expect(worklist.rows[0].rows.at(-1)).toMatchObject({ eligibility: "optional" });

    await ownerClient.mutation(api.attendance.markForMember, {
      eventId: ongoing,
      profileId: member.profileId,
      status: "present",
    });
    const afterMark = await ownerClient.query(api.attendance.attendanceWorklist, {
      groupId,
      now,
    });
    expect(afterMark.rows.map((row) => row.event._id)).not.toContain(ongoing);
    const correction = await ownerClient.query(api.attendance.eventDetail, { eventId: ongoing });
    expect(correction).toMatchObject({ isComplete: true, markedRequiredCount: 1 });
    await ownerClient.mutation(api.attendance.markForMember, {
      eventId: ongoing,
      profileId: member.profileId,
      status: "absent",
    });
    expect(
      (await ownerClient.query(api.attendance.eventDetail, { eventId: ongoing })).rows[0]
        .effectiveStatus,
    ).toBe("absent");
  });

  test("worklist pagination reaches an incomplete event behind more than 100 newer events", async () => {
    const t = makeTest();
    const now = Date.now();
    const owner = await seedProfile(t, "Owner");
    const member = await seedProfile(t, "Member");
    const groupId = await seedGroup(t, owner.profileId, "OLDER1");
    const membershipId = await seedMembership(
      t,
      member.profileId,
      groupId,
      "active",
      now - 1_000_000,
    );
    const olderIncomplete = await seedEvent(
      t,
      groupId,
      owner.profileId,
      now - 500_000,
      now - 499_000,
      { title: "Older incomplete" },
    );
    await t.run(async (ctx) => {
      for (let index = 0; index < 105; index += 1) {
        const startAt = now - 1_000 - index * 1_000;
        const eventId = await ctx.db.insert("events", {
          groupId,
          title: `Complete ${index}`,
          venue: "Home",
          startAt,
          endAt: startAt + 100,
          createdByProfileId: owner.profileId,
          createdAt: startAt,
          updatedAt: startAt,
        });
        await ctx.db.insert("attendance", {
          eventId,
          groupId,
          profileId: member.profileId,
          membershipId,
          finalStatus: "present",
          finalizedAt: now,
          finalizedByProfileId: owner.profileId,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const ownerClient = asUser(t, owner.userId);
    let cursor: string | null = null;
    let found = false;
    let calls = 0;
    do {
      const page: {
        rows: Array<{ event: { _id: Id<"events"> } }>;
        scannedEventCount: number;
        isDone: boolean;
        continueCursor: string;
      } = await ownerClient.query(api.attendance.attendanceWorklist, {
        groupId,
        now,
        paginationOpts: { numItems: 20, cursor },
      });
      calls += 1;
      expect(page.scannedEventCount).toBeLessThanOrEqual(20);
      found ||= page.rows.some((row) => row.event._id === olderIncomplete);
      if (page.isDone) break;
      cursor = page.continueCursor;
    } while (calls < 10);

    expect(found).toBe(true);
    expect(calls).toBeGreaterThan(5);
  });

  test("recent completed correction list is bounded and capability-authorized", async () => {
    const t = makeTest();
    const now = Date.now();
    const admin = await seedAdmin(t);
    const owner = await seedProfile(t, "Owner");
    const coLeader = await seedProfile(t, "Co");
    const member = await seedProfile(t, "Member");
    const outsider = await seedProfile(t, "Outsider");
    const groupId = await seedGroup(t, owner.profileId, "CORRECT");
    const membershipId = await seedMembership(
      t,
      member.profileId,
      groupId,
      "active",
      now - 100_000,
    );
    await asUser(t, admin.userId).mutation(api.admin.assignCoLeader, {
      groupId,
      profileId: coLeader.profileId,
    });
    const completed = await seedEvent(
      t,
      groupId,
      owner.profileId,
      now - 20_000,
      now - 10_000,
      { title: "Completed" },
    );
    await seedEvent(t, groupId, owner.profileId, now - 9_000, now - 8_000, {
      title: "Incomplete",
    });
    const cancelled = await seedEvent(
      t,
      groupId,
      owner.profileId,
      now - 7_000,
      now - 6_000,
      { title: "Cancelled", cancelled: true },
    );
    const future = await seedEvent(
      t,
      groupId,
      owner.profileId,
      now + 1_000,
      now + 2_000,
      { title: "Future" },
    );
    await t.run(async (ctx) => {
      for (const eventId of [completed, cancelled, future]) {
        await ctx.db.insert("attendance", {
          eventId,
          groupId,
          profileId: member.profileId,
          membershipId,
          finalStatus: "absent",
          finalizedAt: now,
          finalizedByProfileId: owner.profileId,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const list = await asUser(t, coLeader.userId).query(
      api.attendance.listRecentCompletedEvents,
      { groupId, limit: 100 },
    );
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({
      event: { _id: completed },
      requiredCount: 1,
      markedRequiredCount: 1,
    });
    expect(list.scannedEventCount).toBeLessThanOrEqual(list.scanLimit);
    await expect(
      asUser(t, outsider.userId).query(api.attendance.listRecentCompletedEvents, {
        groupId,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      asUser(t, coLeader.userId).query(api.attendance.eventDetail, {
        eventId: completed,
      }),
    ).resolves.toMatchObject({ isComplete: true, accessRole: "coLeader" });
  });
});


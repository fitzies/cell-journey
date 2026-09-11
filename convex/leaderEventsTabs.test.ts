import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, makeTest, resetBackendTestState, seedAdmin, seedEvent, seedGroup, seedMembership, seedProfile } from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

describe("leader navigation configuration", () => {
  test("defaults to split and switches both ways without touching events", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const groupId = await seedGroup(t, owner.profileId);
    const eventId = await seedEvent(t, groupId, owner.profileId, 10, 20);
    const client = asUser(t, owner.userId);
    expect(await client.query(api.appConfig.mobile, {})).toEqual({ leaderEventsLayout: "split" });
    const before = await t.run((ctx) => ctx.db.get(eventId));
    await t.mutation(internal.appConfig.setLeaderEventsLayout, { layout: "combined" });
    expect(await client.query(api.appConfig.mobile, {})).toEqual({ leaderEventsLayout: "combined" });
    await t.mutation(internal.appConfig.setLeaderEventsLayout, { layout: "split" });
    expect(await client.query(api.appConfig.mobile, {})).toEqual({ leaderEventsLayout: "split" });
    expect(await t.run((ctx) => ctx.db.query("appConfig").take(2))).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(eventId))).toEqual(before);
  });

  test("requires authentication to read config and validates layout values", async () => {
    const t = makeTest();
    await expect(t.query(api.appConfig.mobile, {})).rejects.toThrow("Not authenticated");
    // @ts-expect-error Convex must reject unrecognized settings at runtime too.
    await expect(t.mutation(internal.appConfig.setLeaderEventsLayout, { layout: "invalid" })).rejects.toThrow();
  });
});

describe("split leader events", () => {
  test("completion follows saved attendance and stays consistent with event detail", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const member = await seedProfile(t, "Member");
    const visitor = await seedProfile(t, "Visitor");
    const optional = await seedProfile(t, "Inactive");
    const groupId = await seedGroup(t, owner.profileId);
    const now = Date.now();
    await seedMembership(t, member.profileId, groupId, "active", now - 10_000);
    const visitorMembership = await seedMembership(t, visitor.profileId, groupId, "active", now - 10_000);
    await t.run((ctx) => ctx.db.patch(visitorMembership, { memberClass: "visitor" }));
    await seedMembership(t, optional.profileId, groupId, "inactive", now - 20_000, now - 10_000);
    const eventId = await seedEvent(t, groupId, owner.profileId, now - 5_000, now - 1_000);
    const client = asUser(t, owner.userId);
    const args = { groupId, phase: "started" as const, now, paginationOpts: { numItems: 30, cursor: null } };
    const expectCompletion = async (complete: boolean) => {
      const list = await client.query(api.events.listForLeaderTab, args);
      expect(list.page[0]).toMatchObject({ _id: eventId, attendanceComplete: complete });
      expect((await client.query(api.attendance.eventDetail, { eventId })).isComplete).toBe(complete);
    };
    await expectCompletion(false);
    await client.mutation(api.attendance.markForMember, { eventId, profileId: member.profileId, status: "absent" });
    await expectCompletion(false);
    await client.mutation(api.attendance.markForMember, { eventId, profileId: visitor.profileId, status: "present" });
    // Optional people do not prevent the roster being complete.
    await expectCompletion(true);
    // Corrections remain allowed and the row stays complete.
    await client.mutation(api.attendance.markForMember, { eventId, profileId: member.profileId, status: "present" });
    await expectCompletion(true);
  });

  test("partitions at event start, includes completed events, and omits cancellations", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const groupId = await seedGroup(t, owner.profileId);
    const older = await seedEvent(t, groupId, owner.profileId, 10, 20);
    const ongoing = await seedEvent(t, groupId, owner.profileId, 90, 110);
    const boundary = await seedEvent(t, groupId, owner.profileId, 100, 120);
    const future = await seedEvent(t, groupId, owner.profileId, 101, 121);
    await seedEvent(t, groupId, owner.profileId, 99, 109, { cancelled: true });
    // With no required members, these past events are complete. They still belong in the list.
    const client = asUser(t, owner.userId);
    const args = { groupId, now: 100, paginationOpts: { numItems: 30, cursor: null } };
    const started = await client.query(api.events.listForLeaderTab, { ...args, phase: "started" });
    const upcoming = await client.query(api.events.listForLeaderTab, { ...args, phase: "upcoming" });
    expect(started.page.map((e) => e._id)).toEqual([boundary, ongoing, older]);
    expect(upcoming.page.map((e) => e._id)).toEqual([future]);
    const afterStart = await client.query(api.events.listForLeaderTab, { ...args, now: 101, phase: "started" });
    expect(afterStart.page[0]._id).toBe(future);
  });

  test("paginates across cancelled rows without skipping historical events", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const groupId = await seedGroup(t, owner.profileId);
    const older = await seedEvent(t, groupId, owner.profileId, 10, 20);
    await seedEvent(t, groupId, owner.profileId, 30, 40, { cancelled: true });
    const client = asUser(t, owner.userId);
    const args = { groupId, now: 100, phase: "started" as const };
    const first = await client.query(api.events.listForLeaderTab, { ...args, paginationOpts: { numItems: 1, cursor: null } });
    expect(first.page).toEqual([]);
    expect(first.isDone).toBe(false);
    const second = await client.query(api.events.listForLeaderTab, { ...args, paginationOpts: { numItems: 1, cursor: first.continueCursor } });
    expect(second.page.map((e) => e._id)).toEqual([older]);
  });

  test("allows owners and active co-leaders, denies members and unrelated leaders", async () => {
    const t = makeTest();
    const admin = await seedAdmin(t);
    const owner = await seedProfile(t, "Owner");
    const coLeader = await seedProfile(t, "Co-leader");
    const member = await seedProfile(t, "Member");
    const otherOwner = await seedProfile(t, "Other owner");
    const groupId = await seedGroup(t, owner.profileId);
    await seedGroup(t, otherOwner.profileId, "OTHER");
    await seedMembership(t, member.profileId, groupId);
    const assignment = await asUser(t, admin.userId).mutation(api.admin.assignCoLeader, { groupId, profileId: coLeader.profileId });
    for (const phase of ["upcoming", "started"] as const) {
      const args = { groupId, phase, now: Date.now(), paginationOpts: { numItems: 30, cursor: null } };
      await expect(asUser(t, owner.userId).query(api.events.listForLeaderTab, args)).resolves.toMatchObject({ page: [] });
      await expect(asUser(t, coLeader.userId).query(api.events.listForLeaderTab, args)).resolves.toMatchObject({ page: [] });
      await expect(asUser(t, member.userId).query(api.events.listForLeaderTab, args)).rejects.toThrow();
      await expect(asUser(t, otherOwner.userId).query(api.events.listForLeaderTab, args)).rejects.toThrow();
      await expect(t.query(api.events.listForLeaderTab, args)).rejects.toThrow();
    }
    await asUser(t, admin.userId).mutation(api.admin.revokeCoLeader, { assignmentId: assignment!._id });
    await expect(asUser(t, coLeader.userId).query(api.events.listForLeaderTab, { groupId, phase: "started", now: Date.now(), paginationOpts: { numItems: 30, cursor: null } })).rejects.toThrow();
  });
});

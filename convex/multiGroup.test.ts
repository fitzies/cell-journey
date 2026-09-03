/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeTest() {
  return convexTest(schema, modules);
}

type TestClient = ReturnType<typeof makeTest>;

async function seedProfile(t: TestClient, name: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      role: "member",
      onboardingStatus: "needsGroup",
      fullName: name,
      singaporeRegion: "central",
      serviceIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { userId, profileId };
  });
}

function asUser(t: TestClient, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

describe("multi-group relationships", () => {
  test("approves memberships in two groups for one user", async () => {
    const t = makeTest();
    const serviceId = await t.run((ctx) => ctx.db.insert("services", {
      name: "Sunday",
      sortOrder: 1,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    const member = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Member" });
      const profileId = await ctx.db.insert("userProfiles", {
        userId,
        role: "member",
        onboardingStatus: "needsGroup",
        fullName: "Member",
        singaporeRegion: "central",
        serviceIds: [serviceId],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { userId, profileId };
    });
    const leader = await seedProfile(t, "Leader");
    const { firstGroupId, secondGroupId } = await t.run(async (ctx) => {
      const now = Date.now();
      const firstGroupId = await ctx.db.insert("groups", {
        name: "Alpha",
        code: "ALPHA1",
        leaderProfileId: leader.profileId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const secondGroupId = await ctx.db.insert("groups", {
        name: "Beta",
        code: "BETA12",
        leaderProfileId: leader.profileId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      return { firstGroupId, secondGroupId };
    });

    const memberClient = asUser(t, member.userId);
    const leaderClient = asUser(t, leader.userId);
    const firstRequest = await memberClient.mutation(api.groups.requestToJoinByCode, { code: "ALPHA1" });
    const secondRequest = await memberClient.mutation(api.groups.requestToJoinByCode, { code: "BETA12" });
    expect(firstRequest?._id).not.toBe(secondRequest?._id);

    await leaderClient.mutation(api.groups.approveJoinRequest, { joinRequestId: firstRequest!._id });
    await leaderClient.mutation(api.groups.approveJoinRequest, { joinRequestId: secondRequest!._id });

    const context = await memberClient.query(api.profiles.currentContext, {});
    expect(context.memberGroups.map((row) => row.group._id).sort()).toEqual(
      [firstGroupId, secondGroupId].sort(),
    );
  });

  test("one user can lead multiple groups and remain a member", async () => {
    const t = makeTest();
    const person = await seedProfile(t, "Both Modes");
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const memberGroupId = await ctx.db.insert("groups", {
        name: "Member Group",
        code: "MEMBR1",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const firstLedGroupId = await ctx.db.insert("groups", {
        name: "Led One",
        code: "LEAD01",
        leaderProfileId: person.profileId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const secondLedGroupId = await ctx.db.insert("groups", {
        name: "Led Two",
        code: "LEAD02",
        leaderProfileId: person.profileId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("memberships", {
        profileId: person.profileId,
        groupId: memberGroupId,
        status: "active",
        joinedAt: now - 10_000,
      });
      return { memberGroupId, firstLedGroupId, secondLedGroupId };
    });

    const client = asUser(t, person.userId);
    const context = await client.query(api.profiles.currentContext, {});
    expect(context.memberGroups).toHaveLength(1);
    expect(context.ledGroups).toHaveLength(2);

    await client.mutation(api.events.createForGroup, {
      groupId: seeded.firstLedGroupId,
      title: "First",
      location: "Room 1",
      startAt: Date.now() + 60_000,
      endAt: Date.now() + 120_000,
    });
    await client.mutation(api.events.createForGroup, {
      groupId: seeded.secondLedGroupId,
      title: "Second",
      location: "Room 2",
      startAt: Date.now() + 60_000,
      endAt: Date.now() + 120_000,
    });
  });

  test("group-scoped authorization rejects unrelated leaders", async () => {
    const t = makeTest();
    const leader = await seedProfile(t, "Leader");
    const other = await seedProfile(t, "Other");
    const groupId = await t.run((ctx) => ctx.db.insert("groups", {
      name: "Protected",
      code: "PROT01",
      leaderProfileId: leader.profileId,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    await expect(asUser(t, other.userId).mutation(api.events.createForGroup, {
      groupId,
      title: "Unauthorized",
      location: "Nowhere",
      startAt: Date.now() + 60_000,
      endAt: Date.now() + 120_000,
    })).rejects.toThrow("Unauthorized");
  });

  test("leaving one group preserves the other membership", async () => {
    const t = makeTest();
    const member = await seedProfile(t, "Member");
    const groups = await t.run(async (ctx) => {
      const now = Date.now();
      const first = await ctx.db.insert("groups", { name: "One", code: "GROUP1", isActive: true, createdAt: now, updatedAt: now });
      const second = await ctx.db.insert("groups", { name: "Two", code: "GROUP2", isActive: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("memberships", { profileId: member.profileId, groupId: first, status: "active", joinedAt: now });
      await ctx.db.insert("memberships", { profileId: member.profileId, groupId: second, status: "active", joinedAt: now });
      return { first, second };
    });

    const client = asUser(t, member.userId);
    await client.mutation(api.groups.leaveGroup, { groupId: groups.first });
    const context = await client.query(api.profiles.currentContext, {});
    expect(context.memberGroups.map((row) => row.group._id)).toEqual([groups.second]);
  });

  test("a leader can self-submit attendance through a separate membership", async () => {
    const t = makeTest();
    const person = await seedProfile(t, "Leader Member");
    const eventId = await t.run(async (ctx) => {
      const now = Date.now();
      const memberGroupId = await ctx.db.insert("groups", {
        name: "Member Group",
        code: "SELFIN",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("groups", {
        name: "Led Group",
        code: "LEADER",
        leaderProfileId: person.profileId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const membershipId = await ctx.db.insert("memberships", {
        profileId: person.profileId,
        groupId: memberGroupId,
        status: "active",
        joinedAt: now - 60_000,
      });
      await ctx.db.patch(person.profileId, {
        role: "leader",
        currentGroupId: memberGroupId,
        activeMembershipId: membershipId,
      });
      return await ctx.db.insert("events", {
        groupId: memberGroupId,
        title: "Open Event",
        location: "Home",
        startAt: now - 1_000,
        endAt: now + 60_000,
        createdByProfileId: person.profileId,
        createdAt: now,
        updatedAt: now,
      });
    });

    const attendance = await asUser(t, person.userId).mutation(api.attendance.selfSubmit, { eventId });
    expect(attendance?.memberSubmittedStatus).toBe("present");
  });

  test("attendance rates are isolated by selected group", async () => {
    const t = makeTest();
    const member = await seedProfile(t, "History Member");
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const presentGroup = await ctx.db.insert("groups", { name: "Present", code: "PRESNT", isActive: true, createdAt: now, updatedAt: now });
      const absentGroup = await ctx.db.insert("groups", { name: "Absent", code: "ABSENT", isActive: true, createdAt: now, updatedAt: now });
      const presentMembership = await ctx.db.insert("memberships", { profileId: member.profileId, groupId: presentGroup, status: "active", joinedAt: now - 100_000 });
      await ctx.db.insert("memberships", { profileId: member.profileId, groupId: absentGroup, status: "active", joinedAt: now - 100_000 });
      const presentEvent = await ctx.db.insert("events", { groupId: presentGroup, title: "Present Event", location: "A", startAt: now - 10_000, endAt: now - 5_000, createdByProfileId: member.profileId, createdAt: now, updatedAt: now });
      await ctx.db.insert("events", { groupId: absentGroup, title: "Absent Event", location: "B", startAt: now - 10_000, endAt: now - 5_000, createdByProfileId: member.profileId, createdAt: now, updatedAt: now });
      await ctx.db.insert("attendance", { eventId: presentEvent, groupId: presentGroup, profileId: member.profileId, membershipId: presentMembership, finalStatus: "present", finalizedAt: now, finalizedByProfileId: member.profileId, createdAt: now, updatedAt: now });
      return { presentGroup, absentGroup };
    });

    const client = asUser(t, member.userId);
    const present = await client.query(api.attendance.historyForGroup, { groupId: seeded.presentGroup });
    const absent = await client.query(api.attendance.historyForGroup, { groupId: seeded.absentGroup });
    expect(present.attendanceRate).toBe(1);
    expect(absent.attendanceRate).toBe(0);
  });

  test("ongoing events do not reduce attendance rates", async () => {
    const t = makeTest();
    const member = await seedProfile(t, "Current Event Member");
    const groupId = await t.run(async (ctx) => {
      const now = Date.now();
      const groupId = await ctx.db.insert("groups", { name: "Current", code: "CURRNT", isActive: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("memberships", { profileId: member.profileId, groupId, status: "active", joinedAt: now - 100_000 });
      await ctx.db.insert("events", { groupId, title: "Still Running", location: "Home", startAt: now - 1_000, endAt: now + 60_000, createdByProfileId: member.profileId, createdAt: now, updatedAt: now });
      return groupId;
    });

    const history = await asUser(t, member.userId).query(api.attendance.historyForGroup, { groupId });
    expect(history.totalPastEvents).toBe(0);
    expect(history.attendanceRate).toBeNull();
  });

  test("approval resolves a pending request when membership already exists", async () => {
    const t = makeTest();
    const member = await seedProfile(t, "Existing Member");
    const leader = await seedProfile(t, "Leader");
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const groupId = await ctx.db.insert("groups", { name: "Existing", code: "EXIST1", leaderProfileId: leader.profileId, isActive: true, createdAt: now, updatedAt: now });
      const membershipId = await ctx.db.insert("memberships", { profileId: member.profileId, groupId, status: "active", joinedAt: now });
      const requestId = await ctx.db.insert("joinRequests", { profileId: member.profileId, groupId, status: "pending", requestedAt: now });
      return { groupId, membershipId, requestId };
    });

    const leaderClient = asUser(t, leader.userId);
    const result = await leaderClient.mutation(api.groups.approveJoinRequest, { joinRequestId: seeded.requestId });
    expect(result?._id).toBe(seeded.membershipId);
    const retried = await leaderClient.mutation(api.groups.approveJoinRequest, { joinRequestId: seeded.requestId });
    expect(retried?._id).toBe(seeded.membershipId);
    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(seeded.requestId),
      memberships: await ctx.db.query("memberships").withIndex("by_profile_and_group_and_status", (q) => q.eq("profileId", member.profileId).eq("groupId", seeded.groupId).eq("status", "active")).take(2),
    }));
    expect(state.request?.status).toBe("approved");
    expect(state.memberships).toHaveLength(1);
  });

  test("admin assignment preserves incomplete onboarding", async () => {
    const previousAdminEmails = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "admin@example.com";
    try {
      const t = makeTest();
      const target = await seedProfile(t, "Incomplete");
      const seeded = await t.run(async (ctx) => {
        const now = Date.now();
        const adminUserId = await ctx.db.insert("users", {
          name: "Admin",
          email: "admin@example.com",
          emailVerificationTime: now,
        });
        const groupId = await ctx.db.insert("groups", { name: "Assigned", code: "ASSIGN", isActive: true, createdAt: now, updatedAt: now });
        return { adminUserId, groupId };
      });

      await asUser(t, seeded.adminUserId).mutation(api.admin.assignMemberToGroup, {
        profileId: target.profileId,
        groupId: seeded.groupId,
      });
      const profile = await t.run((ctx) => ctx.db.get(target.profileId));
      expect(profile?.onboardingStatus).toBe("profileIncomplete");
    } finally {
      if (previousAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = previousAdminEmails;
    }
  });

  test("legacy leader APIs remain valid for one led group", async () => {
    const t = makeTest();
    const member = await seedProfile(t, "Legacy Member");
    const leader = await seedProfile(t, "Legacy Leader");
    await t.run(async (ctx) => {
      const now = Date.now();
      const groupId = await ctx.db.insert("groups", { name: "Legacy", code: "LEGACY", leaderProfileId: leader.profileId, isActive: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("memberships", { profileId: member.profileId, groupId, status: "active", joinedAt: now });
      await ctx.db.insert("joinRequests", { profileId: member.profileId, groupId, status: "pending", requestedAt: now });
    });

    const client = asUser(t, leader.userId);
    expect(await client.query(api.groups.listPendingJoinRequests, {})).toHaveLength(1);
    await client.mutation(api.groups.removeMember, { profileId: member.profileId });
    const context = await asUser(t, member.userId).query(api.profiles.currentContext, {});
    expect(context.memberGroups).toHaveLength(0);
  });
});

import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  makeTest,
  resetBackendTestState,
  seedAdmin,
  seedGroup,
  seedMembership,
  seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

describe("co-leader capabilities", () => {
  test("admin assignment is unique, audited, exposed in context, and revocable", async () => {
    const t = makeTest();
    const admin = await seedAdmin(t);
    const owner = await seedProfile(t, "Owner");
    const coLeader = await seedProfile(t, "Co");
    const groupId = await seedGroup(t, owner.profileId);
    const adminClient = asUser(t, admin.userId);

    const first = await adminClient.mutation(api.admin.assignCoLeader, {
      groupId,
      profileId: coLeader.profileId,
    });
    const duplicate = await adminClient.mutation(api.admin.assignCoLeader, {
      groupId,
      profileId: coLeader.profileId,
    });
    expect(duplicate?._id).toBe(first?._id);

    const context = await asUser(t, coLeader.userId).query(api.profiles.currentContext, {});
    expect(context.ledGroups).toHaveLength(1);
    expect(context.ledGroups[0]).toMatchObject({
      _id: groupId,
      accessRole: "coLeader",
      capabilities: {
        createEvents: true,
        importEvents: true,
        readAttendance: true,
        markAttendance: true,
        updateEvents: false,
        cancelEvents: false,
        manageJoinRequests: false,
        manageMembers: false,
        reorderMembers: false,
        changeGroup: false,
      },
    });

    const listed = await adminClient.query(api.admin.listCoLeaderAssignments, {
      groupId,
      status: "active",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0].displayName).toBe("Co");

    const revoked = await adminClient.mutation(api.admin.revokeCoLeader, {
      assignmentId: first!._id,
      reason: "Rotation ended",
    });
    expect(revoked).toMatchObject({
      status: "revoked",
      revokedByUserId: admin.userId,
      revocationReason: "Rotation ended",
    });
    expect(
      (await asUser(t, coLeader.userId).query(api.profiles.currentContext, {})).ledGroups,
    ).toHaveLength(0);

    const replacement = await adminClient.mutation(api.admin.assignCoLeader, {
      groupId,
      profileId: coLeader.profileId,
    });
    expect(replacement?._id).not.toBe(first?._id);
  });

  test("co-leader allow/deny matrix keeps owner-only mutations narrow", async () => {
    const t = makeTest();
    const now = Date.now();
    const admin = await seedAdmin(t);
    const owner = await seedProfile(t, "Owner");
    const coLeader = await seedProfile(t, "Co");
    const member = await seedProfile(t, "Member");
    const inactive = await seedProfile(t, "Inactive");
    const applicant = await seedProfile(t, "Applicant");
    const groupId = await seedGroup(t, owner.profileId, "MATRIX");
    const memberMembershipId = await seedMembership(
      t,
      member.profileId,
      groupId,
      "active",
      now - 100_000,
    );
    const inactiveMembershipId = await seedMembership(
      t,
      inactive.profileId,
      groupId,
      "inactive",
      now - 200_000,
      now - 150_000,
    );
    const joinRequestId = await t.run((ctx) =>
      ctx.db.insert("joinRequests", {
        profileId: applicant.profileId,
        groupId,
        status: "pending",
        requestedAt: now,
      }),
    );
    await asUser(t, admin.userId).mutation(api.admin.assignCoLeader, {
      groupId,
      profileId: coLeader.profileId,
    });
    const co = asUser(t, coLeader.userId);

    const created = await co.mutation(api.events.createForGroup, {
      groupId,
      title: "Co-created",
      venue: "Home",
      startAt: now - 10_000,
      endAt: now - 5_000,
    });
    expect(created?.createdByProfileId).toBe(coLeader.profileId);
    await expect(
      co.mutation(api.events.importForGroup, {
        groupId,
        sourceType: "csv",
        fileName: "events.csv",
        events: [
          {
            sourceRow: 2,
            title: "Imported",
            venue: "Home",
            word: "",
            worship: "",
            remarks: "",
            startAt: now + 100_000,
            endAt: now + 200_000,
          },
        ],
      }),
    ).resolves.toEqual({ insertedCount: 1 });
    await expect(
      co.mutation(api.attendance.markForMember, {
        eventId: created!._id,
        profileId: member.profileId,
        status: "present",
      }),
    ).resolves.toMatchObject({ finalStatus: "present" });
    await expect(
      co.query(api.events.listForGroup, { groupId, from: 0 }),
    ).resolves.toHaveLength(2);
    await expect(
      co.query(api.attendance.eventDetail, { eventId: created!._id }),
    ).resolves.toMatchObject({ accessRole: "coLeader" });

    const eventUpdate = {
      eventId: created!._id,
      title: "Changed",
      venue: "Home",
      startAt: now - 10_000,
      endAt: now - 5_000,
    };
    await expect(co.mutation(api.events.update, eventUpdate)).rejects.toThrow("Unauthorized");
    await expect(co.mutation(api.events.cancel, { eventId: created!._id })).rejects.toThrow(
      "Unauthorized",
    );
    await expect(
      co.mutation(api.groups.approveJoinRequest, { joinRequestId }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      co.mutation(api.groups.rejectJoinRequest, { joinRequestId }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      co.mutation(api.groups.markMemberInactive, { groupId, membershipId: memberMembershipId }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      co.mutation(api.groups.reactivateMember, { groupId, membershipId: inactiveMembershipId }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      co.mutation(api.groups.removeMemberFromGroupById, {
        groupId,
        profileId: member.profileId,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      co.mutation(api.groups.reorderMembers, {
        groupId,
        status: "active",
        membershipIds: [memberMembershipId],
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      co.query(api.groups.listPendingJoinRequestsForGroup, { groupId }),
    ).rejects.toThrow("Unauthorized");
    await expect(co.query(api.groups.listMembers, { groupId })).rejects.toThrow("Unauthorized");
    await expect(
      co.mutation(api.admin.updateGroup, {
        groupId,
        name: "Nope",
        code: "MATRIX",
        isActive: true,
      }),
    ).rejects.toThrow("not allowed");
    await expect(
      co.mutation(api.admin.setGroupLeader, { groupId, profileId: coLeader.profileId }),
    ).rejects.toThrow("not allowed");
  });
});


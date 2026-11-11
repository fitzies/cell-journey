import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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

type TestClient = ReturnType<typeof makeTest>;

async function verifiedProfile(t: TestClient, name: string, email: string) {
  const seeded = await seedProfile(t, name, { email });
  await t.run((ctx) => ctx.db.patch(seeded.userId, { emailVerificationTime: Date.now() }));
  return seeded;
}

/** Two regions, one group in each, and a regional leader for the north region. */
async function setup() {
  const t = makeTest();
  const admin = await seedAdmin(t);
  const adminClient = asUser(t, admin.userId);
  const regional = await verifiedProfile(t, "Regina", "regina@example.com");
  const northOwner = await seedProfile(t, "NorthOwner");
  const southOwner = await seedProfile(t, "SouthOwner");
  const northMember = await seedProfile(t, "NorthMember");
  const southMember = await seedProfile(t, "SouthMember");
  const northGroup = await seedGroup(t, northOwner.profileId, "NORTH1");
  const southGroup = await seedGroup(t, southOwner.profileId, "SOUTH1");
  await seedMembership(t, northMember.profileId, northGroup);
  await seedMembership(t, southMember.profileId, southGroup);

  const northRegion = await adminClient.mutation(api.regions.create, { name: "North" });
  const southRegion = await adminClient.mutation(api.regions.create, { name: "South" });
  await adminClient.mutation(api.regions.setGroupRegion, { groupId: northGroup, regionId: northRegion });
  await adminClient.mutation(api.regions.setGroupRegion, { groupId: southGroup, regionId: southRegion });
  await adminClient.mutation(api.regions.assignLeader, {
    regionId: northRegion,
    profileId: regional.profileId,
  });
  return {
    t,
    admin,
    adminClient,
    regional,
    regionalClient: asUser(t, regional.userId),
    northOwner,
    southOwner,
    northMember,
    southMember,
    northGroup,
    southGroup,
    northRegion,
    southRegion,
  };
}

async function pendingRequest(
  t: TestClient,
  profileId: Id<"userProfiles">,
  groupId: Id<"groups">,
) {
  return await t.run((ctx) =>
    ctx.db.insert("joinRequests", { profileId, groupId, status: "pending", requestedAt: Date.now() }),
  );
}

describe("regional leaders", () => {
  test("me reports the regional role and regions; strangers are denied", async () => {
    const { t, regionalClient, northRegion, adminClient } = await setup();
    expect(await regionalClient.query(api.admin.me, {})).toMatchObject({
      isAdmin: false,
      hasAccess: true,
      role: "regionalLeader",
      regions: [{ _id: northRegion, name: "North" }],
    });
    expect(await adminClient.query(api.admin.me, {})).toMatchObject({
      isAdmin: true,
      hasAccess: true,
      role: "admin",
    });

    const stranger = await verifiedProfile(t, "Stranger", "stranger@example.com");
    const strangerClient = asUser(t, stranger.userId);
    expect(await strangerClient.query(api.admin.me, {})).toMatchObject({
      hasAccess: false,
      role: null,
      reason: "notAllowed",
    });
    await expect(strangerClient.query(api.admin.listGroups, {})).rejects.toThrow("not allowed");
    await expect(strangerClient.query(api.regions.list, {})).rejects.toThrow("not allowed");
  });

  test("an unverified regional leader is asked to verify their email", async () => {
    const { t, regional, regionalClient } = await setup();
    await t.run((ctx) => ctx.db.patch(regional.userId, { emailVerificationTime: undefined }));
    expect(await regionalClient.query(api.admin.me, {})).toMatchObject({
      hasAccess: false,
      reason: "emailNotVerified",
    });
  });

  test("lists are scoped to the regional leader's groups", async () => {
    const s = await setup();
    const { regionalClient, northGroup, southGroup } = s;

    const groups = await regionalClient.query(api.admin.listGroups, {});
    expect(groups.map((row) => row.group._id)).toEqual([northGroup]);
    expect(groups[0].region).toEqual({ _id: s.northRegion, name: "North" });

    const attendance = await regionalClient.query(api.admin.listGroupAttendance, {
      from: Date.now() - 30 * 86_400_000,
      to: Date.now(),
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(attendance.page.map((row) => row.group._id)).toEqual([northGroup]);
    expect(attendance.page[0].regionName).toBe("North");

    const people = await regionalClient.query(api.admin.listUsers, {});
    const names = people.map((row) => row.displayName).sort();
    expect(names).toEqual(["NorthMember", "NorthOwner"]);

    await pendingRequest(s.t, s.southMember.profileId, northGroup);
    await pendingRequest(s.t, s.northMember.profileId, southGroup);
    const requests = await regionalClient.query(api.admin.listPendingJoinRequests, {});
    expect(requests.map((row) => row.group?._id)).toEqual([northGroup]);

    const regions = await regionalClient.query(api.regions.list, {});
    expect(regions.map((row) => row.region.name)).toEqual(["North"]);
    expect(regions[0].leaders.map((leader) => leader.displayName)).toEqual(["Regina"]);

    // Admins see everything, including the regional badge on people.
    const adminPeople = await s.adminClient.query(api.admin.listUsers, {});
    expect(adminPeople.find((row) => row.displayName === "Regina")?.regionalRegions).toMatchObject([
      { regionId: s.northRegion, name: "North" },
    ]);
    expect((await s.adminClient.query(api.regions.list, {})).map((row) => row.region.name)).toEqual([
      "North",
      "South",
    ]);
  });

  test("they manage their own groups but not other regions' groups", async () => {
    const s = await setup();
    const { t, regionalClient, northGroup, southGroup } = s;

    await regionalClient.mutation(api.admin.updateGroup, {
      groupId: northGroup,
      name: "North Renamed",
      code: "NORTH1",
      isActive: true,
    });
    await expect(
      regionalClient.mutation(api.admin.updateGroup, {
        groupId: southGroup,
        name: "Nope",
        code: "SOUTH1",
        isActive: true,
      }),
    ).rejects.toThrow("Group not found");

    const newLeader = await seedProfile(t, "NewLeader");
    await seedMembership(t, newLeader.profileId, northGroup);
    await regionalClient.mutation(api.admin.setGroupLeader, {
      groupId: northGroup,
      profileId: newLeader.profileId,
    });
    await expect(
      regionalClient.mutation(api.admin.setGroupLeader, { groupId: southGroup, profileId: newLeader.profileId }),
    ).rejects.toThrow("Group not found");

    const coLeader = await regionalClient.mutation(api.admin.assignCoLeader, {
      groupId: northGroup,
      profileId: s.northMember.profileId,
    });
    expect(coLeader).toMatchObject({ assignedByKind: "regionalLeader", assignedByUserId: s.regional.userId });
    await expect(
      regionalClient.mutation(api.admin.assignCoLeader, { groupId: southGroup, profileId: s.southMember.profileId }),
    ).rejects.toThrow("Group not found");

    // Revoking a co-leader in another region is hidden too.
    const southAssignment = await s.adminClient.mutation(api.admin.assignCoLeader, {
      groupId: southGroup,
      profileId: s.southMember.profileId,
    });
    await expect(
      regionalClient.mutation(api.admin.revokeCoLeader, { assignmentId: southAssignment!._id }),
    ).rejects.toThrow("not found");

    const joiner = await seedProfile(t, "Joiner");
    const northRequest = await pendingRequest(t, joiner.profileId, northGroup);
    const southRequest = await pendingRequest(t, joiner.profileId, southGroup);
    await regionalClient.mutation(api.admin.approveJoinRequest, { joinRequestId: northRequest });
    await expect(
      regionalClient.mutation(api.admin.approveJoinRequest, { joinRequestId: southRequest }),
    ).rejects.toThrow("not found");
    await expect(
      regionalClient.mutation(api.admin.rejectJoinRequest, { joinRequestId: southRequest }),
    ).rejects.toThrow("not found");

    await expect(
      regionalClient.query(api.admin.groupMemberAttendance, { groupId: southGroup, from: 0, to: Date.now() }),
    ).rejects.toThrow("Group not found");
    await expect(
      regionalClient.mutation(api.admin.assignMemberToGroup, { profileId: joiner.profileId, groupId: southGroup }),
    ).rejects.toThrow("Group not found");
    await expect(
      regionalClient.mutation(api.admin.removeMembership, { profileId: s.southMember.profileId, groupId: southGroup }),
    ).rejects.toThrow("Group not found");
  });

  test("admin-only actions are refused", async () => {
    const s = await setup();
    const { regionalClient } = s;
    await expect(regionalClient.mutation(api.regions.create, { name: "East" })).rejects.toThrow("Only admins");
    await expect(
      regionalClient.mutation(api.regions.assignLeader, { regionId: s.southRegion, profileId: s.regional.profileId }),
    ).rejects.toThrow("Only admins");
    await expect(
      regionalClient.mutation(api.regions.setGroupRegion, { groupId: s.southGroup, regionId: s.northRegion }),
    ).rejects.toThrow("Only admins");
    await expect(
      regionalClient.mutation(api.admin.createService, { name: "Sunday", sortOrder: 0 }),
    ).rejects.toThrow("Only admins");
    await expect(regionalClient.query(api.admin.listServices, {})).rejects.toThrow("Only admins");
    await expect(
      regionalClient.mutation(api.admin.deleteUser, { profileId: s.northMember.profileId }),
    ).rejects.toThrow("Only admins");
  });

  test("invites need one of their groups and add the person to it", async () => {
    const s = await setup();
    const { t, regionalClient, northGroup, southGroup } = s;
    await expect(
      regionalClient.mutation(api.admin.createInvitedProfile, {
        firstName: "No",
        lastName: "Group",
        email: "nogroup@example.com",
      }),
    ).rejects.toThrow("Choose one of your groups");
    await expect(
      regionalClient.mutation(api.admin.createInvitedProfile, {
        firstName: "Wrong",
        lastName: "Group",
        email: "wrong@example.com",
        groupId: southGroup,
      }),
    ).rejects.toThrow("Group not found");

    const invited = await regionalClient.mutation(api.admin.createInvitedProfile, {
      firstName: "New",
      lastName: "Person",
      email: "new@example.com",
      groupId: northGroup,
      phone: "9123 4567",
    });
    expect(invited).toMatchObject({ invitedEmail: "new@example.com", phone: "+6591234567" });
    const membership = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_profile_and_group_and_status", (q) =>
          q.eq("profileId", invited!._id).eq("groupId", northGroup).eq("status", "active"),
        )
        .unique(),
    );
    expect(membership).not.toBeNull();
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((job) => job.name.includes("inviteEmails"))).toBe(true);
  });

  test("new groups go into one of their regions", async () => {
    const s = await setup();
    const { t, regionalClient } = s;
    const created = await regionalClient.mutation(api.admin.createGroup, { name: "Fresh", code: "FRESH1" });
    expect(created?.regionId).toBe(s.northRegion);
    expect((await regionalClient.query(api.admin.listGroups, {})).map((row) => row.group.name).sort()).toEqual([
      "Fresh",
      "Group NORTH1",
    ]);
    await expect(
      regionalClient.mutation(api.admin.createGroup, { name: "Elsewhere", code: "ELSE01", regionId: s.southRegion }),
    ).rejects.toThrow("Choose one of your regions");

    // With two regions they must choose.
    const east = await s.adminClient.mutation(api.regions.create, { name: "East" });
    await s.adminClient.mutation(api.regions.assignLeader, { regionId: east, profileId: s.regional.profileId });
    await expect(
      regionalClient.mutation(api.admin.createGroup, { name: "Ambiguous", code: "AMBIG1" }),
    ).rejects.toThrow("Choose one of your regions");
    const eastGroup = await regionalClient.mutation(api.admin.createGroup, {
      name: "Eastern",
      code: "EAST01",
      regionId: east,
    });
    expect(eastGroup?.regionId).toBe(east);

    // Moving a group out of their regions is refused.
    await expect(
      regionalClient.mutation(api.admin.updateGroup, {
        groupId: s.northGroup,
        name: "Group NORTH1",
        code: "NORTH1",
        isActive: true,
        regionId: s.southRegion,
      }),
    ).rejects.toThrow("Choose one of your regions");
    void t;
  });

  test("removing a region or deleting the leader removes access", async () => {
    const s = await setup();
    const { t, adminClient, regionalClient } = s;
    await adminClient.mutation(api.admin.deleteUser, { profileId: s.regional.profileId });
    const assignments = await t.run((ctx) => ctx.db.query("regionalLeaderAssignments").collect());
    expect(assignments).toEqual([]);

    const other = await setup();
    await other.adminClient.mutation(api.regions.remove, { regionId: other.northRegion });
    expect(await other.regionalClient.query(api.admin.me, {})).toMatchObject({ hasAccess: false });
    const group = await other.t.run((ctx) => ctx.db.get(other.northGroup));
    expect(group?.regionId).toBeUndefined();
    void regionalClient;
  });
});

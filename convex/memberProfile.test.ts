import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { asUser, makeTest, resetBackendTestState, seedEvent, seedGroup, seedMembership, seedProfile } from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

test.each(["active", "inactive"] as const)("owner can view a %s member's display fields and email without internal account or other-group data", async (status) => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const serviceId = await t.run(ctx => ctx.db.insert("services", {
    name: "Sunday", sortOrder: 1, isActive: true, createdAt: Date.now(), updatedAt: Date.now(),
  }));
  const member = await seedProfile(t, "Sarah", { structured: true, serviceId, email: "private@example.com" });
  const groupId = await seedGroup(t, owner.profileId);
  const membershipId = await seedMembership(t, member.profileId, groupId, status);
  const otherGroupId = await seedGroup(t, owner.profileId, "OTHER");
  await seedMembership(t, member.profileId, otherGroupId);
  const storageId = await t.run(async ctx => {
    const id = await ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" }));
    await ctx.db.patch(member.profileId, { preferredName: "Sarah", postalDistrict: "D18", avatarStorageId: id });
    return id;
  });
  const result = await asUser(t, owner.userId).query(api.groups.getMemberProfile, { groupId, membershipId });
  expect(result).toEqual({
    groupName: "Group GROUP1", status, serviceNames: ["Sunday"],
    email: "private@example.com",
    groupSummary: { joinedAt: expect.any(Number), attendanceRate: null, presentEvents: 0, totalPastEvents: 0 },
    profile: {
      firstName: "Sarah", lastName: "Test", preferredName: "Sarah", fullName: "Sarah Test",
      postalDistrict: "D18", singaporeRegion: "central",
      photoUrl: await t.run(ctx => ctx.storage.getUrl(storageId)),
    },
  });
});

test("own profile and owner view share the selected group's attendance calculation", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const member = await seedProfile(t, "Member", { email: "member@example.com" });
  const groupId = await seedGroup(t, owner.profileId);
  const otherGroupId = await seedGroup(t, owner.profileId, "OTHER");
  const membershipId = await seedMembership(t, member.profileId, groupId, "active", 100);
  await seedMembership(t, member.profileId, otherGroupId, "active", 200);
  const presentId = await seedEvent(t, groupId, owner.profileId, 300, 400);
  await seedEvent(t, groupId, owner.profileId, 500, 600);
  await seedEvent(t, groupId, owner.profileId, 700, 800, { cancelled: true });
  await seedEvent(t, groupId, owner.profileId, 2_000_000, 2_100_000);
  await seedEvent(t, otherGroupId, owner.profileId, 300, 400);
  const leaderClient = asUser(t, owner.userId);
  await leaderClient.mutation(api.attendance.markForMember, { eventId: presentId, profileId: member.profileId, status: "present" });
  const memberClient = asUser(t, member.userId);
  const own = await memberClient.query(api.groups.getMyProfileDetails, { groupId });
  const viewed = await leaderClient.query(api.groups.getMemberProfile, { groupId, membershipId });
  const history = await memberClient.query(api.attendance.historyForGroup, { groupId });
  expect(own.email).toBe("member@example.com");
  expect(own.groupSummary).toEqual({ joinedAt: 100, attendanceRate: 0.5, presentEvents: 1, totalPastEvents: 2 });
  expect(viewed?.groupSummary).toEqual(own.groupSummary);
  expect(history).toMatchObject({ attendanceRate: own.groupSummary?.attendanceRate, totalPastEvents: 2 });
  expect((await memberClient.query(api.groups.getMyProfileDetails, { groupId: otherGroupId })).groupSummary)
    .toEqual({ joinedAt: 200, attendanceRate: 0, presentEvents: 0, totalPastEvents: 1 });
  // A leader can also be a member. The profile still reports their own attendance.
  await seedMembership(t, owner.profileId, groupId, "active", 900);
  expect((await leaderClient.query(api.groups.getMyProfileDetails, { groupId })).groupSummary)
    .toEqual({ joinedAt: 900, attendanceRate: null, presentEvents: 0, totalPastEvents: 0 });
});

test("own details require authentication and do not manufacture membership statistics for a leader", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner", { email: "owner@example.com" });
  const groupId = await seedGroup(t, owner.profileId);
  await expect(t.query(api.groups.getMyProfileDetails, { groupId })).rejects.toThrow("Not authenticated");
  const client = asUser(t, owner.userId);
  expect(await client.query(api.groups.getMyProfileDetails, { groupId })).toEqual({ email: "owner@example.com", groupSummary: null });
  expect(await client.query(api.groups.getMyProfileDetails, {})).toEqual({ email: "owner@example.com", groupSummary: null });
});

test("email uses the linked account and supports stored identity and invitation fallbacks", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const member = await seedProfile(t, "Member", { email: "current@example.com" });
  const groupId = await seedGroup(t, owner.profileId);
  const membershipId = await seedMembership(t, member.profileId, groupId);
  const client = asUser(t, owner.userId);
  const readEmail = async () => (await client.query(api.groups.getMemberProfile, { groupId, membershipId }))?.email;
  await t.run(ctx => ctx.db.patch(member.profileId, { identityEmailNormalized: "identity@example.com", invitedEmail: "invite@example.com" }));
  expect(await readEmail()).toBe("current@example.com");
  await t.run(ctx => ctx.db.patch(member.userId, { email: undefined }));
  expect(await readEmail()).toBe("identity@example.com");
  await t.run(ctx => ctx.db.patch(member.profileId, { userId: undefined, identityEmailNormalized: undefined }));
  expect(await readEmail()).toBe("invite@example.com");
  await t.run(ctx => ctx.db.patch(member.profileId, { invitedEmail: undefined }));
  expect(await readEmail()).toBeNull();
});

test("rejects anonymous users, members, and owners of unrelated groups", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const member = await seedProfile(t, "Member");
  const otherOwner = await seedProfile(t, "Other owner");
  const groupId = await seedGroup(t, owner.profileId);
  const membershipId = await seedMembership(t, member.profileId, groupId);
  await seedGroup(t, otherOwner.profileId, "OTHER");
  const args = { groupId, membershipId };
  await expect(t.query(api.groups.getMemberProfile, args)).rejects.toThrow("Not authenticated");
  for (const user of [member, otherOwner]) {
    await expect(asUser(t, user.userId).query(api.groups.getMemberProfile, args)).rejects.toThrow("Unauthorized");
  }
});

test("does not resolve malformed IDs, mismatched groups, or an ended membership through another active membership", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const member = await seedProfile(t, "Member");
  const groupId = await seedGroup(t, owner.profileId);
  const otherGroupId = await seedGroup(t, owner.profileId, "OTHER");
  const membershipId = await seedMembership(t, member.profileId, groupId);
  const otherMembershipId = await seedMembership(t, member.profileId, otherGroupId);
  const client = asUser(t, owner.userId);
  expect(await client.query(api.groups.getMemberProfile, { groupId: "bad-id", membershipId })).toBeNull();
  expect(await client.query(api.groups.getMemberProfile, { groupId, membershipId: "bad-id" })).toBeNull();
  expect(await client.query(api.groups.getMemberProfile, { groupId, membershipId: otherMembershipId })).toBeNull();
  await client.mutation(api.groups.removeMemberFromGroupById, { groupId, profileId: member.profileId });
  expect(await client.query(api.groups.getMemberProfile, { groupId, membershipId })).toBeNull();
  expect(await client.query(api.groups.getMemberProfile, { groupId: otherGroupId, membershipId: otherMembershipId })).not.toBeNull();
});

test("rechecks owner access and group availability on each query", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const newOwner = await seedProfile(t, "New owner");
  const member = await seedProfile(t, "Member");
  const groupId = await seedGroup(t, owner.profileId);
  const membershipId = await seedMembership(t, member.profileId, groupId);
  const args = { groupId, membershipId };
  const client = asUser(t, owner.userId);
  expect(await client.query(api.groups.getMemberProfile, args)).not.toBeNull();
  await t.run(ctx => ctx.db.patch(groupId, { leaderProfileId: newOwner.profileId }));
  await expect(client.query(api.groups.getMemberProfile, args)).rejects.toThrow("Unauthorized");
  await t.run(ctx => ctx.db.patch(groupId, { isActive: false }));
  await expect(asUser(t, newOwner.userId).query(api.groups.getMemberProfile, args)).rejects.toThrow("Unauthorized");
});

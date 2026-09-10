import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { asUser, makeTest, resetBackendTestState, seedEvent, seedGroup, seedMembership, seedProfile } from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

async function setup() {
  const t = makeTest();
  process.env.ADMIN_EMAILS = "admin@example.com";
  const admin = await seedProfile(t, "Admin", { email: "admin@example.com" });
  await t.run((ctx) => ctx.db.patch(admin.userId, { emailVerificationTime: Date.now() }));
  return { t, admin, client: asUser(t, admin.userId) };
}

describe("admin user deletion", () => {
  test("requires a verified admin and prevents self-deletion", async () => {
    const { t, admin, client } = await setup();
    const person = await seedProfile(t, "Member");
    const args = { profileId: person.profileId };
    await expect(t.mutation(api.admin.deleteUser, args)).rejects.toThrow("Not authenticated");
    await expect(asUser(t, person.userId).mutation(api.admin.deleteUser, args)).rejects.toThrow("not allowed");
    await expect(client.mutation(api.admin.deleteUser, { profileId: admin.profileId })).rejects.toThrow("own account");
    await t.run((ctx) => ctx.db.patch(admin.userId, { emailVerificationTime: undefined }));
    await expect(client.mutation(api.admin.deleteUser, args)).rejects.toThrow("Verify your email");
    expect(await t.run((ctx) => ctx.db.get(person.userId))).not.toBeNull();
  });

  test("removes access and directory entry, preserves history, and blocks reassignment", async () => {
    vi.useFakeTimers();
    const { t, admin, client } = await setup();
    const person = await seedProfile(t, "Member", { email: "member@example.com" });
    const groupId = await seedGroup(t, person.profileId);
    const membershipId = await seedMembership(t, person.profileId, groupId);
    const eventId = await seedEvent(t, groupId, person.profileId, Date.now() - 1000, Date.now() - 500);
    const attendanceId = await t.run(async (ctx) => {
      await ctx.db.insert("authSessions", { userId: person.userId, expirationTime: Date.now() + 10000 });
      return ctx.db.insert("attendance", { profileId: person.profileId, groupId, eventId, membershipId, finalStatus: "present", createdAt: Date.now(), updatedAt: Date.now() });
    });
    await client.mutation(api.admin.deleteUser, { profileId: person.profileId });
    expect(await t.run((ctx) => ctx.db.get(person.userId))).toBeNull();
    expect(await asUser(t, person.userId).query(api.profiles.currentOrNull, {})).toBeNull();
    expect((await client.query(api.admin.listUsers, {})).map((row) => row.profile._id)).toEqual([admin.profileId]);
    for (const mutation of [api.admin.assignMemberToGroup, api.admin.assignCoLeader, api.admin.setGroupLeader]) {
      await expect(client.mutation(mutation, { profileId: person.profileId, groupId })).rejects.toThrow("Profile not found");
    }
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(membershipId))).toMatchObject({ status: "left" });
    expect(await t.run((ctx) => ctx.db.get(groupId))).not.toHaveProperty("leaderProfileId");
    expect(await t.run((ctx) => ctx.db.get(attendanceId))).toMatchObject({ finalStatus: "present", profileId: person.profileId });
    expect(await t.run((ctx) => ctx.db.get(eventId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.query("authSessions").take(10))).toEqual([]);
    expect(await client.mutation(api.admin.deleteUser, { profileId: person.profileId })).toBeNull();
  });

  test("deletes an unclaimed invitation and its memberships without touching other users", async () => {
    vi.useFakeTimers();
    const { t, admin, client } = await setup();
    const groupId = await seedGroup(t, admin.profileId);
    const profileId = await t.run((ctx) => ctx.db.insert("userProfiles", {
      invitedEmail: "invited@example.com", firstName: "Invited", lastName: "Person", fullName: "Invited Person",
      role: "member", onboardingStatus: "approved", serviceIds: [], createdAt: Date.now(), updatedAt: Date.now(),
    }));
    const membershipId = await seedMembership(t, profileId, groupId);
    await client.mutation(api.admin.deleteUser, { profileId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(profileId))).toMatchObject({ fullName: "Deleted member", deletedAt: expect.any(Number) });
    expect(await t.run((ctx) => ctx.db.get(profileId))).not.toHaveProperty("invitedEmail");
    expect(await t.run((ctx) => ctx.db.get(membershipId))).toMatchObject({ status: "left" });
    expect(await t.run((ctx) => ctx.db.get(admin.userId))).not.toBeNull();
    expect((await client.query(api.admin.listUsers, {})).map((row) => row.profile._id)).toEqual([admin.profileId]);
  });
});

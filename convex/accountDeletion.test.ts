import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { hashOtpEmail } from "./emailOtp";
import { asUser, makeTest, resetBackendTestState, seedEvent, seedGroup, seedMembership, seedProfile } from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

async function finishDeletion(t: ReturnType<typeof makeTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("account deletion", () => {
  test("requires authentication and cannot target another user", async () => {
    const t = makeTest();
    const other = await seedProfile(t, "Other");
    await expect(t.mutation(api.accountDeletion.deleteCurrentAccount, {})).rejects.toThrow("Not authenticated");
    await expect(asUser(t, other.userId).mutation(api.accountDeletion.deleteCurrentAccount,
      // @ts-expect-error The public API deliberately accepts no identity arguments.
      { userId: other.userId })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(other.userId))).not.toBeNull();
  });

  test("erases identity immediately and preserves anonymous historical attendance", async () => {
    vi.useFakeTimers();
    const t = makeTest();
    const owner = await seedProfile(t, "Sarah", { email: "sarah@example.com", structured: true });
    const other = await seedProfile(t, "Other");
    const groupId = await seedGroup(t, owner.profileId);
    const membershipId = await seedMembership(t, owner.profileId, groupId);
    const inactiveId = await seedMembership(t, owner.profileId, await seedGroup(t, other.profileId, "OTHER"), "inactive", Date.now() - 500, Date.now() - 100);
    const eventId = await seedEvent(t, groupId, owner.profileId, Date.now() - 10000, Date.now() - 5000);
    const attendanceId = await t.run(async (ctx) => {
      await ctx.db.patch(owner.profileId, { preferredName: "S", postalDistrict: "D18", invitedEmail: "sarah@example.com", identityEmailNormalized: "sarah@example.com", claimedAt: Date.now(), currentGroupId: groupId, activeMembershipId: membershipId });
      await ctx.db.insert("joinRequests", { profileId: owner.profileId, groupId, status: "pending", requestedAt: Date.now(), rejectionReason: "Private detail" });
      await ctx.db.insert("coLeaderAssignments", { profileId: owner.profileId, groupId, status: "active", assignedAt: Date.now(), assignedByKind: "developer", createdAt: Date.now(), updatedAt: Date.now() });
      await ctx.db.insert("pushTokens", { profileId: owner.profileId, token: "private-device-token", platform: "ios", isActive: true, createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: Date.now() });
      return ctx.db.insert("attendance", { profileId: owner.profileId, groupId, eventId, membershipId, finalStatus: "present", finalizationNote: "Private note", finalizedByProfileId: other.profileId, createdAt: Date.now(), updatedAt: Date.now() });
    });
    const otherBefore = await t.run((ctx) => ctx.db.get(other.profileId));
    await asUser(t, owner.userId).mutation(api.accountDeletion.deleteCurrentAccount, {});
    const profile = await t.run((ctx) => ctx.db.get(owner.profileId));
    expect(profile).toEqual({ _id: owner.profileId, _creationTime: expect.any(Number), role: "member", onboardingStatus: "profileIncomplete", fullName: "Deleted member", serviceIds: [], createdAt: expect.any(Number), updatedAt: expect.any(Number) });
    expect(await t.run((ctx) => ctx.db.get(owner.userId))).toBeNull();
    expect(await asUser(t, owner.userId).query(api.profiles.currentOrNull, {})).toBeNull();
    await expect(asUser(t, owner.userId).mutation(api.profiles.getOrCreateCurrent, {})).rejects.toThrow("Authenticated user not found");
    await finishDeletion(t);
    expect(await t.run((ctx) => ctx.db.get(membershipId))).toMatchObject({ status: "left", endedAt: expect.any(Number) });
    expect(await t.run((ctx) => ctx.db.get(inactiveId))).toMatchObject({ status: "left" });
    expect(await t.run((ctx) => ctx.db.get(attendanceId))).toMatchObject({ finalStatus: "present", eventId, profileId: owner.profileId });
    expect(await t.run((ctx) => ctx.db.get(attendanceId))).not.toHaveProperty("finalizationNote");
    expect(await t.run((ctx) => ctx.db.get(eventId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(groupId))).not.toHaveProperty("leaderProfileId");
    expect(await t.run((ctx) => ctx.db.query("joinRequests").take(10))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("pushTokens").take(10))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("coLeaderAssignments").take(10))).toEqual([]);
    expect((await t.run((ctx) => ctx.db.query("membershipActivityPeriods").take(10))).every((period) => period.endedAt !== undefined)).toBe(true);
    expect(await t.run((ctx) => ctx.db.get(other.profileId))).toEqual(otherBefore);
  });

  test("deletes auth sessions, refresh chains, verifiers, codes and rate-limit identity", async () => {
    vi.useFakeTimers();
    const t = makeTest();
    const owner = await seedProfile(t, "Owner", { email: "owner@example.com" });
    const other = await seedProfile(t, "Other");
    const otherSession = await t.run(async (ctx) => {
      const accountId = await ctx.db.insert("authAccounts", { userId: owner.userId, provider: "google", providerAccountId: "provider-secret" });
      await ctx.db.insert("authVerificationCodes", { accountId, provider: "google", code: "secret", expirationTime: Date.now() + 1000 });
      await ctx.db.insert("authRateLimits", { identifier: accountId, attemptsLeft: 1, lastAttemptTime: Date.now() });
      await ctx.db.insert("authRateLimits", { identifier: "owner@example.com", attemptsLeft: 1, lastAttemptTime: Date.now() });
      const sessionId = await ctx.db.insert("authSessions", { userId: owner.userId, expirationTime: Date.now() + 10000 });
      await ctx.db.insert("authVerifiers", { sessionId, signature: "secret-verifier" });
      // Exceeds one batch, so cleanup must continue rather than truncate.
      for (let index = 0; index < 115; index++) await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: Date.now() + 1000 });
      return ctx.db.insert("authSessions", { userId: other.userId, expirationTime: Date.now() + 10000 });
    });
    await asUser(t, owner.userId).mutation(api.accountDeletion.deleteCurrentAccount, {});
    await finishDeletion(t);
    for (const table of ["authAccounts", "authVerificationCodes", "authRateLimits", "authRefreshTokens", "authVerifiers"] as const) {
      expect(await t.run((ctx) => ctx.db.query(table).take(200))).toEqual([]);
    }
    expect(await t.run((ctx) => ctx.db.query("authSessions").take(10))).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(otherSession))).not.toBeNull();
  });

  test("deletes profile photo storage", async () => {
    vi.useFakeTimers();
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" })));
    await t.run((ctx) => ctx.db.patch(owner.profileId, { avatarStorageId: storageId }));
    await asUser(t, owner.userId).mutation(api.accountDeletion.deleteCurrentAccount, {});
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
    await finishDeletion(t);
  });

  test("same email gets a fresh profile without reclaiming historical membership", async () => {
    vi.useFakeTimers();
    const t = makeTest();
    const owner = await seedProfile(t, "Owner", { email: "owner@example.com" });
    await t.run((ctx) => ctx.db.patch(owner.profileId, { invitedEmail: "owner@example.com", identityEmailNormalized: "owner@example.com" }));
    await asUser(t, owner.userId).mutation(api.accountDeletion.deleteCurrentAccount, {});
    await finishDeletion(t);
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: "owner@example.com", emailVerificationTime: Date.now() }));
    const fresh = await asUser(t, userId).mutation(api.profiles.getOrCreateCurrent, {});
    expect(fresh?._id).not.toBe(owner.profileId);
    expect(fresh).toMatchObject({ userId, onboardingStatus: "profileIncomplete", serviceIds: [] });
    expect(fresh?.activeMembershipId).toBeUndefined();
  });

  test("deletes old hashed email OTP data while preserving requests made after deletion", async () => {
    vi.useFakeTimers();
    vi.stubEnv("AUTH_OTP_SECRET", "test-secret-with-at-least-thirty-two-characters");
    try {
      const t = makeTest();
      const owner = await seedProfile(t, "Owner", { email: "owner@example.com" });
      const emailHash = await hashOtpEmail("owner@example.com", process.env.AUTH_OTP_SECRET!);
      await t.run(async (ctx) => {
        const requestId = await ctx.db.insert("authEmailOtpRequests", { emailHash, createdAt: Date.now() - 1000 });
        await ctx.db.insert("authEmailOtpCodes", { requestId, emailHash, codeHash: "private-code", expiresAt: Date.now() + 10000, failedAttempts: 0, createdAt: Date.now() - 1000 });
      });
      await asUser(t, owner.userId).mutation(api.accountDeletion.deleteCurrentAccount, {});
      const newRequest = await t.run((ctx) => ctx.db.insert("authEmailOtpRequests", { emailHash, createdAt: Date.now() + 1 }));
      await finishDeletion(t);
      expect(await t.run((ctx) => ctx.db.query("authEmailOtpCodes").take(10))).toEqual([]);
      expect(await t.run((ctx) => ctx.db.query("authEmailOtpRequests").take(10))).toMatchObject([{ _id: newRequest }]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("deletes accounts before onboarding creates a profile", async () => {
    vi.useFakeTimers();
    const t = makeTest();
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Unfinished" }));
    await asUser(t, userId).mutation(api.accountDeletion.deleteCurrentAccount, {});
    expect(await t.run((ctx) => ctx.db.get(userId))).toBeNull();
    await finishDeletion(t);
  });

  test("repeated deletion with a stale authenticated JWT succeeds without touching another account", async () => {
    vi.useFakeTimers();
    const t = makeTest();
    const owner = await seedProfile(t, "Owner", { email: "owner@example.com" });
    const other = await seedProfile(t, "Other");
    const otherBefore = await t.run((ctx) => ctx.db.get(other.profileId));
    const client = asUser(t, owner.userId);
    await client.mutation(api.accountDeletion.deleteCurrentAccount, {});
    // Retrying before the scheduled cleanup completes must also be safe.
    expect(await client.mutation(api.accountDeletion.deleteCurrentAccount, {})).toBeNull();
    await finishDeletion(t);
    const freshUserId = await t.run((ctx) => ctx.db.insert("users", { email: "owner@example.com", emailVerificationTime: Date.now() }));
    const fresh = await asUser(t, freshUserId).mutation(api.profiles.getOrCreateCurrent, {});
    expect(await client.mutation(api.accountDeletion.deleteCurrentAccount, {})).toBeNull();
    await finishDeletion(t);
    expect(await t.run((ctx) => ctx.db.get(other.profileId))).toEqual(otherBefore);
    expect(await t.run((ctx) => ctx.db.get(fresh!._id))).toEqual(fresh);
    expect(await t.run((ctx) => ctx.db.get(freshUserId))).not.toBeNull();
  });

  test("continues cleanup across profile and session batches without touching other people", async () => {
    vi.useFakeTimers();
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const other = await seedProfile(t, "Other");
    const groupId = await seedGroup(t, other.profileId);
    await t.run(async (ctx) => {
      for (let index = 0; index < 115; index++) {
        await ctx.db.insert("memberships", { profileId: owner.profileId, groupId, status: "active", joinedAt: Date.now() - 1000, endReason: "Private history" });
        await ctx.db.insert("authSessions", { userId: owner.userId, expirationTime: Date.now() + 10000 });
        await ctx.db.insert("joinRequests", { profileId: owner.profileId, groupId, status: "rejected", requestedAt: Date.now(), rejectionReason: "Private reason" });
      }
      await ctx.db.insert("joinRequests", { profileId: other.profileId, groupId, status: "pending", requestedAt: Date.now() });
    });
    await asUser(t, owner.userId).mutation(api.accountDeletion.deleteCurrentAccount, {});
    await finishDeletion(t);
    const memberships = await t.run((ctx) => ctx.db.query("memberships").take(200));
    expect(memberships).toHaveLength(115);
    expect(memberships.every((row) => row.status === "left" && row.endReason === undefined)).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("authSessions").take(200))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("joinRequests").take(200))).toMatchObject([{ profileId: other.profileId }]);
  });
});

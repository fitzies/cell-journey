import { afterEach, describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import {
  makeTest,
  resetBackendTestState,
  seedGroup,
  seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

describe("bounded migration backfills", () => {
  test("membership activity backfill caps pages, supports dry-run, and remains auditable", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Migration Owner");
    const groupId = await seedGroup(t, owner.profileId, "MIGRATE");
    await t.run(async (ctx) => {
      for (let index = 0; index < 55; index += 1) {
        await ctx.db.insert("memberships", {
          profileId: owner.profileId,
          groupId,
          status: "active",
          joinedAt: index + 1,
        });
      }
    });

    const dryRun = await t.mutation(
      internal.migrations.backfillMembershipActivityAndSortOrder,
      {
        paginationOpts: { numItems: 1_000, cursor: null },
        dryRun: true,
      },
    );
    expect(dryRun).toMatchObject({
      processed: 50,
      dryRun: true,
      pageSizeCap: 50,
      sortOrdersToPatch: 50,
      sortOrdersPatched: 0,
      periodsToInsert: 50,
      periodsInserted: 0,
      isComplete: false,
    });
    const afterDryRun = await t.run(async (ctx) => ({
      memberships: await ctx.db.query("memberships").take(100),
      periods: await ctx.db.query("membershipActivityPeriods").take(100),
    }));
    expect(afterDryRun.memberships.every((row) => row.sortOrder === undefined)).toBe(true);
    expect(afterDryRun.periods).toHaveLength(0);

    const first = await t.mutation(
      internal.migrations.backfillMembershipActivityAndSortOrder,
      { paginationOpts: { numItems: 1_000, cursor: null } },
    );
    expect(first).toMatchObject({
      processed: 50,
      sortOrdersPatched: 50,
      periodsInserted: 50,
      isComplete: false,
    });
    const second = await t.mutation(
      internal.migrations.backfillMembershipActivityAndSortOrder,
      {
        paginationOpts: { numItems: 1_000, cursor: first.continueCursor },
      },
    );
    expect(second).toMatchObject({
      processed: 5,
      sortOrdersPatched: 5,
      periodsInserted: 5,
      isComplete: true,
    });

    const idempotent = await t.mutation(
      internal.migrations.backfillMembershipActivityAndSortOrder,
      { paginationOpts: { numItems: 50, cursor: null } },
    );
    expect(idempotent).toMatchObject({
      sortOrdersToPatch: 0,
      sortOrdersPatched: 0,
      periodsToInsert: 0,
      periodsInserted: 0,
    });

    const firstAudit = await t.query(internal.migrations.auditMembershipActivityReadiness, {
      paginationOpts: { numItems: 1_000, cursor: null },
    });
    expect(firstAudit).toMatchObject({
      checkedMemberships: 50,
      isComplete: false,
      issues: [],
    });
    const finalAudit = await t.query(internal.migrations.auditMembershipActivityReadiness, {
      paginationOpts: { numItems: 1_000, cursor: firstAudit.continueCursor },
    });
    expect(finalAudit).toMatchObject({
      checkedMemberships: 5,
      isComplete: true,
      issues: [],
    });
  });
});

describe("Google to email OTP account migration", () => {
  test("dry-runs, links the existing user, backfills its profile, and is idempotent", async () => {
    const t = makeTest();
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        name: "Existing Google User",
        email: " Existing.User@Example.COM ",
        emailVerificationTime: now,
      });
      const googleAccountId = await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-subject-1",
      });
      const profileId = await ctx.db.insert("userProfiles", {
        userId,
        role: "member",
        onboardingStatus: "approved",
        fullName: "Existing Google User",
        singaporeRegion: "central",
        serviceIds: [],
        createdAt: now,
        updatedAt: now,
      });
      return { userId, googleAccountId, profileId, profileUpdatedAt: now };
    });

    const dryRun = await t.mutation(
      internal.migrations.migrateGoogleUsersToEmailOtp,
      { dryRun: true },
    );
    expect(dryRun).toMatchObject({
      dryRun: true,
      blockedBySafetyLimit: false,
      googleAccountsScanned: 1,
      uniqueGoogleUsers: 1,
      eligibleUsers: 1,
      accountsToInsert: 1,
      accountsInserted: 0,
      profilesToBackfill: 1,
      profilesBackfilled: 0,
      issues: [],
      skipped: [],
    });
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("authAccounts")
          .withIndex("userIdAndProvider", (q) =>
            q.eq("userId", seeded.userId).eq("provider", "resend-otp"),
          )
          .take(2),
      ),
    ).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.get(seeded.profileId))).toMatchObject({
      _id: seeded.profileId,
      userId: seeded.userId,
      updatedAt: seeded.profileUpdatedAt,
    });
    expect(
      (await t.run((ctx) => ctx.db.get(seeded.profileId)))
        ?.identityEmailNormalized,
    ).toBeUndefined();

    const applied = await t.mutation(
      internal.migrations.migrateGoogleUsersToEmailOtp,
      { dryRun: false },
    );
    expect(applied).toMatchObject({
      eligibleUsers: 1,
      accountsToInsert: 1,
      accountsInserted: 1,
      alreadyLinkedAccounts: 0,
      profilesToBackfill: 1,
      profilesBackfilled: 1,
      issues: [],
      skipped: [],
    });

    const afterApply = await t.run(async (ctx) => ({
      user: await ctx.db.get(seeded.userId),
      profile: await ctx.db.get(seeded.profileId),
      googleAccount: await ctx.db.get(seeded.googleAccountId),
      resendAccounts: await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", seeded.userId).eq("provider", "resend-otp"),
        )
        .take(2),
    }));
    expect(afterApply.user?._id).toBe(seeded.userId);
    expect(afterApply.profile).toMatchObject({
      _id: seeded.profileId,
      userId: seeded.userId,
      identityEmailNormalized: "existing.user@example.com",
    });
    expect(afterApply.googleAccount).toMatchObject({
      _id: seeded.googleAccountId,
      userId: seeded.userId,
      provider: "google",
    });
    expect(afterApply.resendAccounts).toHaveLength(1);
    expect(afterApply.resendAccounts[0]).toMatchObject({
      userId: seeded.userId,
      provider: "resend-otp",
      providerAccountId: "existing.user@example.com",
    });

    const repeated = await t.mutation(
      internal.migrations.migrateGoogleUsersToEmailOtp,
      { dryRun: false },
    );
    expect(repeated).toMatchObject({
      eligibleUsers: 1,
      accountsToInsert: 0,
      accountsInserted: 0,
      alreadyLinkedAccounts: 1,
      profilesToBackfill: 0,
      profilesBackfilled: 0,
      issues: [],
    });
  });

  test("reports account and profile ownership conflicts without partial writes", async () => {
    const t = makeTest();
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();

      const resendOwnerId = await ctx.db.insert("users", {
        email: "resend-owner@example.com",
        emailVerificationTime: now,
      });
      const accountConflictUserId = await ctx.db.insert("users", {
        email: "owned@example.com",
        emailVerificationTime: now,
      });
      await ctx.db.insert("authAccounts", {
        userId: accountConflictUserId,
        provider: "google",
        providerAccountId: "google-account-conflict",
      });
      await ctx.db.insert("authAccounts", {
        userId: resendOwnerId,
        provider: "resend-otp",
        providerAccountId: "owned@example.com",
      });
      const accountConflictProfileId = await ctx.db.insert("userProfiles", {
        userId: accountConflictUserId,
        role: "member",
        onboardingStatus: "approved",
        fullName: "Account Conflict",
        singaporeRegion: "central",
        serviceIds: [],
        createdAt: now,
        updatedAt: now,
      });

      const profileConflictUserId = await ctx.db.insert("users", {
        email: "profile@example.com",
        emailVerificationTime: now,
      });
      await ctx.db.insert("authAccounts", {
        userId: profileConflictUserId,
        provider: "google",
        providerAccountId: "google-profile-conflict",
      });
      const profileConflictProfileId = await ctx.db.insert("userProfiles", {
        userId: profileConflictUserId,
        identityEmailNormalized: "different@example.com",
        role: "member",
        onboardingStatus: "approved",
        fullName: "Profile Conflict",
        singaporeRegion: "central",
        serviceIds: [],
        createdAt: now,
        updatedAt: now,
      });

      const invitedConflictUserId = await ctx.db.insert("users", {
        email: "invited@example.com",
        emailVerificationTime: now,
      });
      await ctx.db.insert("authAccounts", {
        userId: invitedConflictUserId,
        provider: "google",
        providerAccountId: "google-invited-conflict",
      });
      const invitedConflictProfileId = await ctx.db.insert("userProfiles", {
        userId: invitedConflictUserId,
        role: "member",
        onboardingStatus: "approved",
        fullName: "Invited Conflict",
        singaporeRegion: "central",
        serviceIds: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("userProfiles", {
        invitedEmail: "invited@example.com",
        invitedAt: now,
        role: "member",
        onboardingStatus: "profileIncomplete",
        fullName: "Reserved Invite",
        serviceIds: [],
        createdAt: now,
        updatedAt: now,
      });

      return {
        accountConflictUserId,
        accountConflictProfileId,
        profileConflictUserId,
        profileConflictProfileId,
        invitedConflictUserId,
        invitedConflictProfileId,
      };
    });

    const result = await t.mutation(
      internal.migrations.migrateGoogleUsersToEmailOtp,
      { dryRun: false },
    );
    expect(result).toMatchObject({
      uniqueGoogleUsers: 3,
      eligibleUsers: 0,
      accountsToInsert: 0,
      accountsInserted: 0,
      profilesToBackfill: 0,
      profilesBackfilled: 0,
      skipped: [],
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          userId: seeded.accountConflictUserId,
          reason: "resendAccountOwnedByDifferentUser",
        },
        {
          userId: seeded.profileConflictUserId,
          reason: "linkedProfileIdentityEmailMismatch",
        },
        {
          userId: seeded.invitedConflictUserId,
          reason: "invitedEmailBelongsToDifferentProfile",
        },
      ]),
    );

    const state = await t.run(async (ctx) => ({
      resendForAccountConflict: await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q
            .eq("userId", seeded.accountConflictUserId)
            .eq("provider", "resend-otp"),
        )
        .take(2),
      resendForProfileConflict: await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q
            .eq("userId", seeded.profileConflictUserId)
            .eq("provider", "resend-otp"),
        )
        .take(2),
      resendForInvitedConflict: await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q
            .eq("userId", seeded.invitedConflictUserId)
            .eq("provider", "resend-otp"),
        )
        .take(2),
      accountConflictProfile: await ctx.db.get(
        seeded.accountConflictProfileId,
      ),
      profileConflictProfile: await ctx.db.get(
        seeded.profileConflictProfileId,
      ),
      invitedConflictProfile: await ctx.db.get(
        seeded.invitedConflictProfileId,
      ),
    }));
    expect(state.resendForAccountConflict).toHaveLength(0);
    expect(state.resendForProfileConflict).toHaveLength(0);
    expect(state.resendForInvitedConflict).toHaveLength(0);
    expect(state.accountConflictProfile?.identityEmailNormalized).toBeUndefined();
    expect(state.profileConflictProfile?.identityEmailNormalized).toBe(
      "different@example.com",
    );
    expect(state.invitedConflictProfile?.identityEmailNormalized).toBeUndefined();
  });

  test("does not choose a winner when Google users normalize to the same email", async () => {
    const t = makeTest();
    const userIds = await t.run(async (ctx) => {
      const now = Date.now();
      const ids = [];
      for (const [index, email] of [
        "duplicate@example.com",
        " DUPLICATE@EXAMPLE.COM ",
      ].entries()) {
        const userId = await ctx.db.insert("users", {
          email,
          emailVerificationTime: now,
        });
        await ctx.db.insert("authAccounts", {
          userId,
          provider: "google",
          providerAccountId: `google-duplicate-${index}`,
        });
        ids.push(userId);
      }
      return ids;
    });

    const result = await t.mutation(
      internal.migrations.migrateGoogleUsersToEmailOtp,
      { dryRun: false },
    );
    expect(result).toMatchObject({
      uniqueGoogleUsers: 2,
      eligibleUsers: 0,
      accountsInserted: 0,
    });
    expect(result.issues).toEqual(
      userIds.map((userId) => ({
        userId,
        reason: "duplicateVerifiedEmailAcrossUsers",
      })),
    );
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("authAccounts")
          .withIndex("providerAndAccountId", (q) =>
            q
              .eq("provider", "resend-otp")
              .eq("providerAccountId", "duplicate@example.com"),
          )
          .take(2),
      ),
    ).toHaveLength(0);
  });
});

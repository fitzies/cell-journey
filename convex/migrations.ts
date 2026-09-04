import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isProfileComplete, normalizeEmail } from "./profiles";

const MAX_MIGRATION_PAGE_SIZE = 50;
const MAX_GOOGLE_ACCOUNT_MIGRATION_SIZE = 200;
const MAX_AUTH_USER_MIGRATION_AUDIT_SIZE = 500;

type PaginationOpts = { numItems: number; cursor: string | null };

function cappedPaginationOpts(options: PaginationOpts): PaginationOpts {
  const requested = Number.isFinite(options.numItems)
    ? Math.floor(options.numItems)
    : MAX_MIGRATION_PAGE_SIZE;
  return {
    cursor: options.cursor,
    numItems: Math.min(Math.max(requested, 1), MAX_MIGRATION_PAGE_SIZE),
  };
}

type GoogleEmailMigrationIssue = {
  userId: string;
  reason:
    | "duplicateVerifiedEmailAcrossUsers"
    | "invitedEmailBelongsToDifferentProfile"
    | "linkedProfileIdentityEmailMismatch"
    | "linkedProfileInvitedEmailMismatch"
    | "multipleProfilesForUser"
    | "normalizedEmailBelongsToDifferentProfile"
    | "resendAccountOwnedByDifferentUser"
    | "multipleResendAccounts"
    | "userAlreadyHasDifferentResendAccount";
};

type GoogleEmailMigrationSkip = {
  userId: string;
  reason: "invalidEmail" | "missingUser" | "unverifiedOrMissingEmail";
};

type GoogleEmailMigrationPlan = {
  userId: Id<"users">;
  email: string;
  alreadyLinked: boolean;
  profileId?: Id<"userProfiles">;
  backfillProfile: boolean;
};

function migratableOtpEmail(value: string) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

/**
 * One-time bridge from Google login to email OTP for mobile users.
 *
 * Google accounts remain in place for the admin dashboard. This only adds the
 * matching `resend-otp` account to the same verified user and fills a missing
 * normalized profile email. Every user is fully preflighted before any writes,
 * and ambiguous ownership is reported for manual review instead of guessed.
 */
export const migrateGoogleUsersToEmailOtp = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const [googleAccounts, authUsers] = await Promise.all([
      ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) => q.eq("provider", "google"))
        .take(MAX_GOOGLE_ACCOUNT_MIGRATION_SIZE + 1),
      ctx.db.query("users").take(MAX_AUTH_USER_MIGRATION_AUDIT_SIZE + 1),
    ]);

    if (
      googleAccounts.length > MAX_GOOGLE_ACCOUNT_MIGRATION_SIZE ||
      authUsers.length > MAX_AUTH_USER_MIGRATION_AUDIT_SIZE
    ) {
      return {
        dryRun,
        blockedBySafetyLimit: true,
        googleAccountSafetyLimit: MAX_GOOGLE_ACCOUNT_MIGRATION_SIZE,
        authUserAuditSafetyLimit: MAX_AUTH_USER_MIGRATION_AUDIT_SIZE,
        googleAccountsScanned: googleAccounts.length,
        authUsersScanned: authUsers.length,
        uniqueGoogleUsers: 0,
        eligibleUsers: 0,
        accountsToInsert: 0,
        accountsInserted: 0,
        alreadyLinkedAccounts: 0,
        profilesToBackfill: 0,
        profilesBackfilled: 0,
        issues: [] as GoogleEmailMigrationIssue[],
        skipped: [] as GoogleEmailMigrationSkip[],
      };
    }

    const googleUserIds = [
      ...new Set(googleAccounts.map((account) => account.userId)),
    ];
    const skipped: GoogleEmailMigrationSkip[] = [];
    const issues: GoogleEmailMigrationIssue[] = [];
    const verifiedUsers: Array<{ userId: Id<"users">; email: string }> = [];
    const verifiedUserIdsByEmail = new Map<string, Id<"users">[]>();

    for (const user of authUsers) {
      if (typeof user.emailVerificationTime !== "number" || !user.email) continue;
      const email = migratableOtpEmail(user.email);
      if (!email) continue;
      const userIds = verifiedUserIdsByEmail.get(email) ?? [];
      userIds.push(user._id);
      verifiedUserIdsByEmail.set(email, userIds);
    }

    for (const userId of googleUserIds) {
      const user = await ctx.db.get(userId);
      if (!user) {
        skipped.push({ userId, reason: "missingUser" });
        continue;
      }
      if (typeof user.emailVerificationTime !== "number" || !user.email) {
        skipped.push({ userId, reason: "unverifiedOrMissingEmail" });
        continue;
      }
      const email = migratableOtpEmail(user.email);
      if (!email) {
        skipped.push({ userId, reason: "invalidEmail" });
        continue;
      }
      verifiedUsers.push({ userId, email });
    }

    const plans: GoogleEmailMigrationPlan[] = [];
    for (const candidate of verifiedUsers) {
      if ((verifiedUserIdsByEmail.get(candidate.email)?.length ?? 0) > 1) {
        issues.push({
          userId: candidate.userId,
          reason: "duplicateVerifiedEmailAcrossUsers",
        });
        continue;
      }

      const [
        resendAccounts,
        userResendAccounts,
        linkedProfiles,
        identityProfiles,
        invitedProfiles,
      ] = await Promise.all([
        ctx.db
          .query("authAccounts")
          .withIndex("providerAndAccountId", (q) =>
            q
              .eq("provider", "resend-otp")
              .eq("providerAccountId", candidate.email),
          )
          .take(2),
        ctx.db
          .query("authAccounts")
          .withIndex("userIdAndProvider", (q) =>
            q.eq("userId", candidate.userId).eq("provider", "resend-otp"),
          )
          .take(2),
        ctx.db
          .query("userProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", candidate.userId))
          .take(2),
        ctx.db
          .query("userProfiles")
          .withIndex("by_identityEmailNormalized", (q) =>
            q.eq("identityEmailNormalized", candidate.email),
          )
          .take(2),
        ctx.db
          .query("userProfiles")
          .withIndex("by_invitedEmail", (q) =>
            q.eq("invitedEmail", candidate.email),
          )
          .take(2),
      ]);

      if (resendAccounts.length > 1) {
        issues.push({ userId: candidate.userId, reason: "multipleResendAccounts" });
        continue;
      }
      const resendAccount = resendAccounts[0];
      if (resendAccount && resendAccount.userId !== candidate.userId) {
        issues.push({
          userId: candidate.userId,
          reason: "resendAccountOwnedByDifferentUser",
        });
        continue;
      }
      if (
        userResendAccounts.some(
          (account) => account.providerAccountId !== candidate.email,
        )
      ) {
        issues.push({
          userId: candidate.userId,
          reason: "userAlreadyHasDifferentResendAccount",
        });
        continue;
      }
      if (linkedProfiles.length > 1) {
        issues.push({ userId: candidate.userId, reason: "multipleProfilesForUser" });
        continue;
      }

      const linkedProfile = linkedProfiles[0];
      if (
        linkedProfile?.identityEmailNormalized !== undefined &&
        linkedProfile.identityEmailNormalized !== candidate.email
      ) {
        issues.push({
          userId: candidate.userId,
          reason: "linkedProfileIdentityEmailMismatch",
        });
        continue;
      }
      if (
        linkedProfile?.invitedEmail !== undefined &&
        linkedProfile.invitedEmail !== candidate.email
      ) {
        issues.push({
          userId: candidate.userId,
          reason: "linkedProfileInvitedEmailMismatch",
        });
        continue;
      }
      if (
        identityProfiles.some((profile) => profile._id !== linkedProfile?._id)
      ) {
        issues.push({
          userId: candidate.userId,
          reason: "normalizedEmailBelongsToDifferentProfile",
        });
        continue;
      }
      if (invitedProfiles.some((profile) => profile._id !== linkedProfile?._id)) {
        issues.push({
          userId: candidate.userId,
          reason: "invitedEmailBelongsToDifferentProfile",
        });
        continue;
      }

      plans.push({
        userId: candidate.userId,
        email: candidate.email,
        alreadyLinked: resendAccount !== undefined,
        ...(linkedProfile ? { profileId: linkedProfile._id } : {}),
        backfillProfile:
          linkedProfile !== undefined &&
          linkedProfile.identityEmailNormalized === undefined,
      });
    }

    const accountsToInsert = plans.filter((plan) => !plan.alreadyLinked).length;
    const alreadyLinkedAccounts = plans.length - accountsToInsert;
    const profilesToBackfill = plans.filter((plan) => plan.backfillProfile).length;
    let accountsInserted = 0;
    let profilesBackfilled = 0;

    if (!dryRun) {
      const now = Date.now();
      for (const plan of plans) {
        if (!plan.alreadyLinked) {
          await ctx.db.insert("authAccounts", {
            userId: plan.userId,
            provider: "resend-otp",
            providerAccountId: plan.email,
          });
          accountsInserted += 1;
        }
        if (plan.backfillProfile && plan.profileId) {
          await ctx.db.patch(plan.profileId, {
            identityEmailNormalized: plan.email,
            updatedAt: now,
          });
          profilesBackfilled += 1;
        }
      }
    }

    return {
      dryRun,
      blockedBySafetyLimit: false,
      googleAccountSafetyLimit: MAX_GOOGLE_ACCOUNT_MIGRATION_SIZE,
      authUserAuditSafetyLimit: MAX_AUTH_USER_MIGRATION_AUDIT_SIZE,
      googleAccountsScanned: googleAccounts.length,
      authUsersScanned: authUsers.length,
      uniqueGoogleUsers: googleUserIds.length,
      eligibleUsers: plans.length,
      accountsToInsert,
      accountsInserted,
      alreadyLinkedAccounts,
      profilesToBackfill,
      profilesBackfilled,
      issues,
      skipped,
    };
  },
});

/**
 * Rollout order remains widen schema -> deploy compatibility reads/writes ->
 * dry-run and execute every backfill page -> audit every page -> narrow only
 * after audits are clean. Capped page sizes preserve cursor continuation while
 * keeping each backfill/audit transaction bounded.
 */

/**
 * Cursor-based rollout check. Run every page before enabling multi-group writes
 * and again before removing legacy profile pointers.
 */
export const auditMultiGroupReadiness = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("userProfiles")
      .paginate(cappedPaginationOpts(args.paginationOpts));
    const issues: Array<{ profileId: string; issue: string }> = [];

    for (const profile of page.page) {
      const activeMemberships = await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "active"),
        )
        .take(200);
      const inactiveMemberships = await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "inactive"),
        )
        .take(200);
      const currentByGroup = new Map<string, number>();
      for (const membership of [...activeMemberships, ...inactiveMemberships]) {
        currentByGroup.set(
          membership.groupId,
          (currentByGroup.get(membership.groupId) ?? 0) + 1,
        );
      }
      for (const [groupId, count] of currentByGroup) {
        if (count > 1) {
          issues.push({
            profileId: profile._id,
            issue: `${count} current memberships for group ${groupId}`,
          });
        }
      }

      const pending = await ctx.db
        .query("joinRequests")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "pending"),
        )
        .take(200);
      const pendingByGroup = new Map<string, number>();
      for (const request of pending) {
        pendingByGroup.set(request.groupId, (pendingByGroup.get(request.groupId) ?? 0) + 1);
      }
      for (const [groupId, count] of pendingByGroup) {
        if (count > 1) issues.push({ profileId: profile._id, issue: `${count} pending requests for group ${groupId}` });
      }

      const pointer = profile.activeMembershipId
        ? await ctx.db.get(profile.activeMembershipId)
        : null;
      if (profile.activeMembershipId || profile.currentGroupId) {
        if (
          !pointer ||
          pointer.profileId !== profile._id ||
          pointer.status !== "active" ||
          pointer.groupId !== profile.currentGroupId
        ) {
          issues.push({ profileId: profile._id, issue: "legacy membership pointers are not a matching active pair" });
        }
      } else if (activeMemberships.length > 0) {
        issues.push({ profileId: profile._id, issue: "legacy membership pointers are missing" });
      }

      if (profile.leaderGroupId) {
        const group = await ctx.db.get(profile.leaderGroupId);
        if (!group || group.leaderProfileId !== profile._id) {
          issues.push({ profileId: profile._id, issue: "legacy leaderGroupId is stale" });
        }
      }
    }

    return {
      checkedProfiles: page.page.length,
      isComplete: page.isDone,
      continueCursor: page.continueCursor,
      issues,
    };
  },
});

/** Audits sort ranks and interval integrity before narrowing the schema. */
export const auditMembershipActivityReadiness = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("memberships")
      .paginate(cappedPaginationOpts(args.paginationOpts));
    const issues: Array<{ membershipId: string; issue: string }> = [];

    for (const membership of page.page) {
      if (membership.sortOrder === undefined) {
        issues.push({ membershipId: membership._id, issue: "missing sortOrder" });
      }
      const periods = await ctx.db
        .query("membershipActivityPeriods")
        .withIndex("by_membership_and_startedAt", (q) =>
          q.eq("membershipId", membership._id),
        )
        .take(201);
      if (periods.length === 0) {
        issues.push({ membershipId: membership._id, issue: "missing activity periods" });
        continue;
      }
      if (periods.length > 200) {
        issues.push({ membershipId: membership._id, issue: "more than 200 activity periods" });
        continue;
      }
      const sorted = [...periods].sort((a, b) => a.startedAt - b.startedAt);
      let openCount = 0;
      for (let index = 0; index < sorted.length; index += 1) {
        const period = sorted[index];
        if (period.endedAt === undefined) openCount += 1;
        if (period.endedAt !== undefined && period.endedAt < period.startedAt) {
          issues.push({ membershipId: membership._id, issue: "period ends before it starts" });
        }
        const next = sorted[index + 1];
        if (next && (period.endedAt === undefined || period.endedAt > next.startedAt)) {
          issues.push({ membershipId: membership._id, issue: "overlapping activity periods" });
        }
      }
      const expectedOpen = membership.status === "active" ? 1 : 0;
      if (openCount !== expectedOpen) {
        issues.push({
          membershipId: membership._id,
          issue: `expected ${expectedOpen} open period(s), found ${openCount}`,
        });
      }
    }

    return {
      checkedMemberships: page.page.length,
      isComplete: page.isDone,
      continueCursor: page.continueCursor,
      issues,
    };
  },
});

/**
 * Widen/migrate helper for the pre-inactivity data model. Run page-by-page.
 * It never guesses inactive history: those rows are reported by the audit and
 * must be reviewed manually. Legacy active/ended relationships were continuous,
 * so their joinedAt/endedAt interval is safe to preserve.
 */
export const backfillMembershipActivityAndSortOrder = internalMutation({
  args: {
    paginationOpts: paginationOptsValidator,
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const page = await ctx.db
      .query("memberships")
      .paginate(cappedPaginationOpts(args.paginationOpts));
    let sortOrdersToPatch = 0;
    let sortOrdersPatched = 0;
    let periodsToInsert = 0;
    let periodsInserted = 0;
    const manualReviewMembershipIds: string[] = [];

    for (const membership of page.page) {
      if (membership.sortOrder === undefined) {
        sortOrdersToPatch += 1;
        if (!dryRun) {
          await ctx.db.patch(membership._id, { sortOrder: membership.joinedAt });
          sortOrdersPatched += 1;
        }
      }
      const period = await ctx.db
        .query("membershipActivityPeriods")
        .withIndex("by_membership_and_startedAt", (q) =>
          q.eq("membershipId", membership._id),
        )
        .first();
      if (period) continue;
      if (membership.status === "inactive") {
        manualReviewMembershipIds.push(membership._id);
        continue;
      }
      if (membership.status !== "active" && membership.endedAt === undefined) {
        manualReviewMembershipIds.push(membership._id);
        continue;
      }
      periodsToInsert += 1;
      if (!dryRun) {
        const now = Date.now();
        await ctx.db.insert("membershipActivityPeriods", {
          membershipId: membership._id,
          profileId: membership.profileId,
          groupId: membership.groupId,
          startedAt: membership.joinedAt,
          ...(membership.status === "active" ? {} : { endedAt: membership.endedAt }),
          createdAt: now,
          updatedAt: now,
        });
        periodsInserted += 1;
      }
    }

    return {
      processed: page.page.length,
      isComplete: page.isDone,
      continueCursor: page.continueCursor,
      dryRun,
      pageSizeCap: MAX_MIGRATION_PAGE_SIZE,
      sortOrdersToPatch,
      sortOrdersPatched,
      periodsToInsert,
      periodsInserted,
      manualReviewMembershipIds,
    };
  },
});

export const auditStructuredNames = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("userProfiles")
      .paginate(cappedPaginationOpts(args.paginationOpts));
    return {
      checkedProfiles: page.page.length,
      isComplete: page.isDone,
      continueCursor: page.continueCursor,
      structured: page.page
        .filter((profile) => profile.firstName?.trim() && profile.lastName?.trim())
        .map((profile) => profile._id),
      legacyNameOnly: page.page
        .filter(
          (profile) =>
            profile.fullName?.trim() &&
            !profile.firstName?.trim() &&
            !profile.lastName?.trim(),
        )
        .map((profile) => profile._id),
      partialStructuredName: page.page
        .filter(
          (profile) =>
            Boolean(profile.firstName?.trim()) !== Boolean(profile.lastName?.trim()),
        )
        .map((profile) => profile._id),
      missingName: page.page
        .filter(
          (profile) =>
            !profile.fullName?.trim() &&
            !profile.firstName?.trim() &&
            !profile.lastName?.trim(),
        )
        .map((profile) => profile._id),
    };
  },
});

/** Safe direction only: structured names -> deprecated fullName. Never splits. */
export const backfillFullNameFromStructuredNames = internalMutation({
  args: {
    paginationOpts: paginationOptsValidator,
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const page = await ctx.db
      .query("userProfiles")
      .paginate(cappedPaginationOpts(args.paginationOpts));
    let toPatch = 0;
    let patched = 0;
    for (const profile of page.page) {
      const firstName = profile.firstName?.trim();
      const lastName = profile.lastName?.trim();
      if (!firstName || !lastName) continue;
      const fullName = `${firstName} ${lastName}`;
      if (profile.fullName !== fullName) {
        toPatch += 1;
        if (!dryRun) {
          await ctx.db.patch(profile._id, { fullName, updatedAt: Date.now() });
          patched += 1;
        }
      }
    }
    return {
      processed: page.page.length,
      dryRun,
      pageSizeCap: MAX_MIGRATION_PAGE_SIZE,
      toPatch,
      patched,
      isComplete: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const auditCoLeaderAssignments = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("userProfiles")
      .paginate(cappedPaginationOpts(args.paginationOpts));
    const duplicates: Array<{ profileId: string; groupId: string; count: number }> = [];
    for (const profile of page.page) {
      const assignments = await ctx.db
        .query("coLeaderAssignments")
        .withIndex("by_profile_and_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "active"),
        )
        .take(201);
      const counts = new Map<string, number>();
      for (const assignment of assignments) {
        counts.set(assignment.groupId, (counts.get(assignment.groupId) ?? 0) + 1);
      }
      for (const [groupId, count] of counts) {
        if (count > 1) duplicates.push({ profileId: profile._id, groupId, count });
      }
    }
    return {
      checkedProfiles: page.page.length,
      isComplete: page.isDone,
      continueCursor: page.continueCursor,
      duplicates,
    };
  },
});

/** Idempotently repairs deprecated compatibility pointers for one profile. */
export const reconcileProfileCompatibility = internalMutation({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .first();
    const inactiveMembership = membership
      ? null
      : await ctx.db
          .query("memberships")
          .withIndex("by_profile_status", (q) =>
            q.eq("profileId", profile._id).eq("status", "inactive"),
          )
          .first();
    const ledGroup = await ctx.db
      .query("groups")
      .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
      .first();
    const coLeadership = await ctx.db
      .query("coLeaderAssignments")
      .withIndex("by_profile_and_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .first();
    const pending = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "pending"),
      )
      .first();
    const profileComplete = isProfileComplete(profile);

    await ctx.db.patch(profile._id, {
      currentGroupId: membership?.groupId,
      activeMembershipId: membership?._id,
      leaderGroupId: ledGroup?._id,
      role: ledGroup || coLeadership ? "leader" : "member",
      onboardingStatus: !profileComplete
        ? "profileIncomplete"
        : membership || inactiveMembership || ledGroup || coLeadership
          ? "approved"
          : pending
            ? "pendingApproval"
            : "needsGroup",
      updatedAt: Date.now(),
    });
    return await ctx.db.get(profile._id);
  },
});

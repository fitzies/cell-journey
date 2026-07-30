import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { isProfileComplete } from "./profiles";

const MAX_MIGRATION_PAGE_SIZE = 50;

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

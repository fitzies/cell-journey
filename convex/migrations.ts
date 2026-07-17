import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Cursor-based rollout check. Run every page before enabling multi-group writes
 * and again before removing legacy profile pointers.
 */
export const auditMultiGroupReadiness = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("userProfiles").paginate(args.paginationOpts);
    const issues: Array<{ profileId: string; issue: string }> = [];

    for (const profile of page.page) {
      const activeMemberships = await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "active"),
        )
        .take(200);
      const activeByGroup = new Map<string, number>();
      for (const membership of activeMemberships) {
        activeByGroup.set(membership.groupId, (activeByGroup.get(membership.groupId) ?? 0) + 1);
      }
      for (const [groupId, count] of activeByGroup) {
        if (count > 1) issues.push({ profileId: profile._id, issue: `${count} active memberships for group ${groupId}` });
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
    const ledGroup = await ctx.db
      .query("groups")
      .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
      .first();
    const pending = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "pending"),
      )
      .first();
    const profileComplete = Boolean(
      profile.fullName?.trim() && profile.singaporeRegion && profile.serviceIds.length > 0,
    );

    await ctx.db.patch(profile._id, {
      currentGroupId: membership?.groupId,
      activeMembershipId: membership?._id,
      leaderGroupId: ledGroup?._id,
      role: ledGroup ? "leader" : "member",
      onboardingStatus: !profileComplete
        ? "profileIncomplete"
        : membership || ledGroup
          ? "approved"
          : pending
            ? "pendingApproval"
            : "needsGroup",
      updatedAt: Date.now(),
    });
    return await ctx.db.get(profile._id);
  },
});

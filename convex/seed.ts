import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Dev-only helpers callable from the Convex dashboard ("Run a function").
 * These bypass the normal leader authorization so you can shepherd users
 * through onboarding without first creating a leader account.
 */

/**
 * Approve the user's pending join request and put them into the group.
 *
 * Usage in dashboard:
 *   Function: seed:approveByUserId
 *   Args: { "userId": "<users _id>" }
 */
export const approveByUserId = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("No userProfile found for that userId");

    const request = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "pending"),
      )
      .unique();
    if (!request) throw new Error("No pending join request for that user");

    const now = Date.now();
    const membershipId = await ctx.db.insert("memberships", {
      profileId: profile._id,
      groupId: request.groupId,
      status: "active",
      joinedAt: now,
      joinRequestId: request._id,
    });
    await ctx.db.patch(request._id, {
      status: "approved",
      reviewedAt: now,
    });
    await ctx.db.patch(profile._id, {
      currentGroupId: request.groupId,
      activeMembershipId: membershipId,
      onboardingStatus: "approved",
      updatedAt: now,
    });

    return { profileId: profile._id, groupId: request.groupId, membershipId };
  },
});

/**
 * Promote a user to leader of a given group, and set the group's leader.
 *
 * Usage in dashboard:
 *   Function: seed:promoteToLeader
 *   Args: { "userId": "<users _id>", "groupId": "<groups _id>" }
 */
export const promoteToLeader = internalMutation({
  args: { userId: v.id("users"), groupId: v.id("groups") },
  handler: async (ctx, { userId, groupId }) => {
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("No userProfile found for that userId");

    const group = await ctx.db.get(groupId);
    if (!group) throw new Error("Group not found");

    const now = Date.now();
    await ctx.db.patch(profile._id, {
      role: "leader",
      leaderGroupId: groupId,
      onboardingStatus: "approved",
      updatedAt: now,
    });
    await ctx.db.patch(groupId, {
      leaderProfileId: profile._id,
      updatedAt: now,
    });
    return { profileId: profile._id, groupId };
  },
});

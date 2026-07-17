import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { approvePendingJoinRequest } from "./joinRequestFlow";

/** Dev-only helpers callable from the Convex dashboard. */

export const approveByUserId = internalMutation({
  args: { userId: v.id("users"), groupId: v.id("groups") },
  handler: async (ctx, { userId, groupId }) => {
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("No userProfile found for that userId");

    const request = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_and_group_and_status", (q) =>
        q
          .eq("profileId", profile._id)
          .eq("groupId", groupId)
          .eq("status", "pending"),
      )
      .unique();
    if (!request) throw new Error("No pending join request for that user and group");

    const membership = await approvePendingJoinRequest(ctx, request._id);
    return {
      profileId: profile._id,
      groupId,
      membershipId: membership?._id ?? null,
    };
  },
});

async function promoteProfileToLeaderForGroup(
  ctx: MutationCtx,
  profile: Doc<"userProfiles">,
  groupId: Id<"groups">,
) {
  const group = await ctx.db.get(groupId);
  if (!group) throw new Error("Group not found");

  const now = Date.now();
  await ctx.db.patch(profile._id, {
    role: "leader",
    ...(!profile.leaderGroupId ? { leaderGroupId: groupId } : {}),
    onboardingStatus: "approved",
    updatedAt: now,
  });
  await ctx.db.patch(groupId, {
    leaderProfileId: profile._id,
    updatedAt: now,
  });
  return { profileId: profile._id, groupId };
}

export const promoteToLeader = internalMutation({
  args: { userId: v.id("users"), groupId: v.id("groups") },
  handler: async (ctx, { userId, groupId }) => {
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("No userProfile found for that userId");
    return await promoteProfileToLeaderForGroup(ctx, profile, groupId);
  },
});

export const promoteProfileToLeader = internalMutation({
  args: { profileId: v.id("userProfiles"), groupId: v.id("groups") },
  handler: async (ctx, { profileId, groupId }) => {
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("No userProfile found for that profileId");
    return await promoteProfileToLeaderForGroup(ctx, profile, groupId);
  },
});

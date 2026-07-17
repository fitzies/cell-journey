import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const singaporeRegion = v.union(
  v.literal("north"),
  v.literal("south"),
  v.literal("east"),
  v.literal("west"),
  v.literal("central"),
  v.literal("northeast"),
  v.literal("northwest"),
  v.literal("southeast"),
  v.literal("southwest"),
);

type DbCtx = QueryCtx | MutationCtx;

async function requireAuthUserId(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

export function isProfileComplete(profile: Doc<"userProfiles">) {
  return Boolean(
    profile.fullName?.trim() &&
      profile.singaporeRegion &&
      profile.serviceIds.length > 0,
  );
}

export async function getCurrentProfile(ctx: DbCtx) {
  const userId = await requireAuthUserId(ctx);
  return await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function requireCurrentProfile(ctx: DbCtx) {
  const profile = await getCurrentProfile(ctx);
  if (!profile) throw new Error("Profile not found");
  return profile;
}

export async function getActiveMembershipForGroup(
  ctx: DbCtx,
  profileId: Id<"userProfiles">,
  groupId: Id<"groups">,
) {
  return await ctx.db
    .query("memberships")
    .withIndex("by_profile_and_group_and_status", (q) =>
      q.eq("profileId", profileId).eq("groupId", groupId).eq("status", "active"),
    )
    .unique();
}

export async function requireActiveMembership(ctx: DbCtx, groupId: Id<"groups">) {
  const profile = await requireCurrentProfile(ctx);
  const group = await ctx.db.get(groupId);
  if (!group || !group.isActive) throw new Error("Group not found");

  const membership = await getActiveMembershipForGroup(ctx, profile._id, groupId);
  if (!membership) throw new Error("Unauthorized");
  return { profile, membership, group };
}

export async function requireLeadershipForGroup(ctx: DbCtx, groupId: Id<"groups">) {
  const profile = await requireCurrentProfile(ctx);
  const group = await ctx.db.get(groupId);
  if (!group || !group.isActive || group.leaderProfileId !== profile._id) {
    throw new Error("Unauthorized");
  }
  return { profile, group };
}

/**
 * Compatibility helper for legacy single-group functions. New functions must
 * authorize with requireLeadershipForGroup and an explicit target group.
 */
export async function requireLeaderProfile(ctx: DbCtx) {
  const profile = await requireCurrentProfile(ctx);
  const ledGroups = await ctx.db
    .query("groups")
    .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
    .take(2);
  const activeGroups = ledGroups.filter((group) => group.isActive);
  if (activeGroups.length !== 1) {
    throw new Error("Select a group in the latest app version");
  }
  return { ...profile, leaderGroupId: activeGroups[0]._id };
}

async function validateProfileInput(
  ctx: MutationCtx,
  fullName: string,
  serviceIds: Id<"services">[],
) {
  const trimmedFullName = fullName.trim();
  if (!trimmedFullName) throw new Error("Full name is required");

  const uniqueServiceIds = [...new Set(serviceIds)];
  if (uniqueServiceIds.length === 0) throw new Error("Select at least one service");

  for (const serviceId of uniqueServiceIds) {
    const service = await ctx.db.get(serviceId);
    if (!service || !service.isActive) throw new Error("Invalid service selected");
  }

  return { trimmedFullName, uniqueServiceIds };
}

function getCompatibilityOnboardingStatus(profile: Doc<"userProfiles">) {
  if (!isProfileComplete(profile)) return "profileIncomplete" as const;
  if (profile.currentGroupId && profile.activeMembershipId) return "approved" as const;
  if (profile.onboardingStatus === "pendingApproval") return "pendingApproval" as const;
  if (profile.role === "leader") return "approved" as const;
  return "needsGroup" as const;
}

export const getOrCreateCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) return existing;

    const now = Date.now();
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      role: "member",
      onboardingStatus: "profileIncomplete",
      serviceIds: [],
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(profileId);
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => await getCurrentProfile(ctx),
});

export const currentOrNull = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const currentContext = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCurrentProfile(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .take(100);
    const memberGroups = [];
    for (const membership of memberships) {
      const group = await ctx.db.get(membership.groupId);
      if (group?.isActive) memberGroups.push({ membership, group });
    }

    const ledGroups = (
      await ctx.db
        .query("groups")
        .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
        .take(100)
    ).filter((group) => group.isActive);

    const pending = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "pending"),
      )
      .take(100);
    const pendingRequests = [];
    for (const request of pending) {
      const group = await ctx.db.get(request.groupId);
      if (group) pendingRequests.push({ request, group });
    }

    return {
      profile,
      profileComplete: isProfileComplete(profile),
      memberGroups,
      ledGroups,
      pendingRequests,
      canUseMemberMode: memberGroups.length > 0,
      canUseLeaderMode: ledGroups.length > 0,
    };
  },
});

export const updateOnboardingProfile = mutation({
  args: {
    fullName: v.string(),
    preferredName: v.optional(v.string()),
    singaporeRegion,
    serviceIds: v.array(v.id("services")),
  },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const { trimmedFullName, uniqueServiceIds } = await validateProfileInput(
      ctx,
      args.fullName,
      args.serviceIds,
    );
    const now = Date.now();
    const patch = {
      fullName: trimmedFullName,
      preferredName: args.preferredName?.trim() || undefined,
      singaporeRegion: args.singaporeRegion,
      serviceIds: uniqueServiceIds,
      updatedAt: now,
    };

    await ctx.db.patch(profile._id, {
      ...patch,
      onboardingStatus: getCompatibilityOnboardingStatus({ ...profile, ...patch }),
    });
    return await ctx.db.get(profile._id);
  },
});

export const updateProfile = mutation({
  args: {
    fullName: v.string(),
    preferredName: v.optional(v.string()),
    singaporeRegion,
    serviceIds: v.array(v.id("services")),
  },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const { trimmedFullName, uniqueServiceIds } = await validateProfileInput(
      ctx,
      args.fullName,
      args.serviceIds,
    );
    const now = Date.now();
    const patch = {
      fullName: trimmedFullName,
      preferredName: args.preferredName?.trim() || undefined,
      singaporeRegion: args.singaporeRegion,
      serviceIds: uniqueServiceIds,
      updatedAt: now,
    };
    await ctx.db.patch(profile._id, {
      ...patch,
      onboardingStatus: getCompatibilityOnboardingStatus({ ...profile, ...patch }),
    });
    return await ctx.db.get(profile._id);
  },
});

export type ProfileId = Id<"userProfiles">;

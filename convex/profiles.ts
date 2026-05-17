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
);

async function requireAuthUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

export async function getCurrentProfile(ctx: QueryCtx | MutationCtx) {
  const userId = await requireAuthUserId(ctx);
  return await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function requireCurrentProfile(ctx: QueryCtx | MutationCtx) {
  const profile = await getCurrentProfile(ctx);
  if (!profile) throw new Error("Profile not found");
  return profile;
}

export async function requireLeaderProfile(ctx: QueryCtx | MutationCtx) {
  const profile = await requireCurrentProfile(ctx);
  if (profile.role !== "leader") throw new Error("Unauthorized");
  if (!profile.leaderGroupId) throw new Error("Leader has no assigned group");

  const group = await ctx.db.get(profile.leaderGroupId);
  if (!group || !group.isActive || group.leaderProfileId !== profile._id) {
    throw new Error("Unauthorized");
  }

  return profile;
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

function getOnboardingStatus(profile: Doc<"userProfiles">) {
  if (!profile.fullName?.trim() || !profile.singaporeRegion || profile.serviceIds.length === 0) {
    return "profileIncomplete" as const;
  }
  if (profile.currentGroupId && profile.activeMembershipId) return "approved" as const;
  return profile.onboardingStatus === "pendingApproval" ? "pendingApproval" : "needsGroup";
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
  handler: async (ctx) => {
    return await getCurrentProfile(ctx);
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
      onboardingStatus: getOnboardingStatus({ ...profile, ...patch }),
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
      onboardingStatus: getOnboardingStatus({ ...profile, ...patch }),
    });
    return await ctx.db.get(profile._id);
  },
});

export type ProfileId = Id<"userProfiles">;

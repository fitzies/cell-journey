import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { approvePendingJoinRequest, rejectPendingJoinRequest } from "./joinRequestFlow";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_ROWS = 250;

type AuthUser = Doc<"users"> & {
  email?: string;
  name?: string;
  image?: string;
};

function allowedAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function generatedCode(name: string, now: number) {
  const prefix = normalizeCode(name)
    .replace(/[AEIOU]/g, "")
    .slice(0, 3)
    .padEnd(3, "C");
  return `${prefix}${String(now).slice(-3)}`;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const user = (await ctx.db.get(userId)) as AuthUser | null;
  const email = user?.email?.trim().toLowerCase();
  const allowed = allowedAdminEmails();

  if (allowed.length === 0) {
    throw new Error("Admin access is not configured. Set ADMIN_EMAILS in Convex env vars.");
  }
  if (!email || !allowed.includes(email)) {
    throw new Error("This account is not allowed to access admin tools.");
  }

  return { userId, user, email };
}

async function groupName(ctx: QueryCtx, groupId?: Id<"groups">) {
  if (!groupId) return null;
  return (await ctx.db.get(groupId))?.name ?? null;
}

async function userSummary(ctx: QueryCtx, userId: Id<"users">) {
  const user = (await ctx.db.get(userId)) as AuthUser | null;
  return {
    _id: user?._id ?? userId,
    name: user?.name ?? null,
    email: user?.email ?? null,
    image: user?.image ?? null,
  };
}

function publicProfile(profile: Doc<"userProfiles">) {
  return {
    _id: profile._id,
    userId: profile.userId,
    role: profile.role,
    onboardingStatus: profile.onboardingStatus,
    fullName: profile.fullName ?? null,
    preferredName: profile.preferredName ?? null,
    singaporeRegion: profile.singaporeRegion ?? null,
    currentGroupId: profile.currentGroupId ?? null,
    leaderGroupId: profile.leaderGroupId ?? null,
    activeMembershipId: profile.activeMembershipId ?? null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { isAdmin: false, email: null, name: null, reason: "notAuthenticated" as const };

    const user = (await ctx.db.get(userId)) as AuthUser | null;
    const email = user?.email?.trim().toLowerCase() ?? null;
    const allowed = allowedAdminEmails();
    if (allowed.length === 0) {
      return { isAdmin: false, email, name: user?.name ?? null, reason: "notConfigured" as const };
    }
    if (!email || !allowed.includes(email)) {
      return { isAdmin: false, email, name: user?.name ?? null, reason: "notAllowed" as const };
    }

    return { isAdmin: true, email, name: user?.name ?? null, reason: null };
  },
});

export const listUsers = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(args.limit ?? MAX_ROWS, MAX_ROWS);
    const search = args.search?.trim().toLowerCase() ?? "";

    const profiles = await ctx.db.query("userProfiles").order("desc").take(limit);
    const rows = [];

    for (const profile of profiles) {
      const user = await userSummary(ctx, profile.userId);
      const displayName = profile.preferredName || profile.fullName || user.name || user.email || "Unnamed user";
      const currentGroupName = await groupName(ctx, profile.currentGroupId);
      const leaderGroupName = await groupName(ctx, profile.leaderGroupId);
      const haystack = [displayName, user.email, profile.role, currentGroupName, leaderGroupName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (search && !haystack.includes(search)) continue;

      rows.push({
        profile: publicProfile(profile),
        user,
        displayName,
        currentGroupName,
        leaderGroupName,
      });
    }

    return rows;
  },
});

export const listGroups = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const groups = await ctx.db.query("groups").order("desc").take(Math.min(args.limit ?? MAX_ROWS, MAX_ROWS));
    const rows = [];

    for (const group of groups) {
      const leader = group.leaderProfileId ? await ctx.db.get(group.leaderProfileId) : null;
      const activeMembers = await ctx.db
        .query("memberships")
        .withIndex("by_group_status", (q) => q.eq("groupId", group._id).eq("status", "active"))
        .take(200);
      rows.push({
        group,
        leader: leader ? publicProfile(leader) : null,
        leaderName: leader?.preferredName || leader?.fullName || null,
        activeMemberCount: activeMembers.length,
      });
    }

    return rows;
  },
});

export const listPendingJoinRequests = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const requests = await ctx.db
      .query("joinRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(Math.min(args.limit ?? 100, 100));
    const rows = [];
    for (const request of requests) {
      const profile = await ctx.db.get(request.profileId);
      const group = await ctx.db.get(request.groupId);
      rows.push({ request, profile: profile ? publicProfile(profile) : null, group });
    }
    return rows;
  },
});

export const approveJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const reviewer = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return await approvePendingJoinRequest(ctx, args.joinRequestId, {
      reviewedByProfileId: reviewer?._id ?? null,
    });
  },
});

export const rejectJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const reviewer = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return await rejectPendingJoinRequest(ctx, args.joinRequestId, {
      reviewedByProfileId: reviewer?._id ?? null,
      reason: args.reason,
    });
  },
});

export const createGroup = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Group name is required");

    const now = Date.now();
    const code = normalizeCode(args.code?.trim() || generatedCode(name, now));
    if (code.length !== 6) throw new Error("Group code must be exactly 6 letters/numbers");

    const existing = await ctx.db.query("groups").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (existing) throw new Error("Group code is already in use");

    const groupId = await ctx.db.insert("groups", {
      name,
      code,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(groupId);
  },
});

export const updateGroup = mutation({
  args: {
    groupId: v.id("groups"),
    name: v.string(),
    code: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");

    const name = args.name.trim();
    const code = normalizeCode(args.code);
    if (!name) throw new Error("Group name is required");
    if (code.length !== 6) throw new Error("Group code must be exactly 6 letters/numbers");

    const existing = await ctx.db.query("groups").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (existing && existing._id !== group._id) throw new Error("Group code is already in use");

    await ctx.db.patch(group._id, { name, code, isActive: args.isActive, updatedAt: Date.now() });
    return await ctx.db.get(group._id);
  },
});

export const setGroupLeader = mutation({
  args: {
    groupId: v.id("groups"),
    profileId: v.union(v.id("userProfiles"), v.null()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");
    const now = Date.now();

    if (group.leaderProfileId && group.leaderProfileId !== args.profileId) {
      await ctx.db.patch(group.leaderProfileId, {
        role: "member",
        leaderGroupId: undefined,
        onboardingStatus: "needsGroup",
        updatedAt: now,
      });
    }

    if (args.profileId === null) {
      await ctx.db.patch(group._id, { leaderProfileId: undefined, updatedAt: now });
      return null;
    }

    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");

    if (profile.leaderGroupId && profile.leaderGroupId !== group._id) {
      const previousGroup = await ctx.db.get(profile.leaderGroupId);
      if (previousGroup?.leaderProfileId === profile._id) {
        await ctx.db.patch(previousGroup._id, { leaderProfileId: undefined, updatedAt: now });
      }
    }

    if (profile.activeMembershipId) {
      const membership = await ctx.db.get(profile.activeMembershipId);
      if (membership?.status === "active") {
        await ctx.db.patch(membership._id, {
          status: "left",
          endedAt: now,
          endReason: "promotedToLeader",
        });
      }
    }

    await ctx.db.patch(profile._id, {
      role: "leader",
      leaderGroupId: group._id,
      currentGroupId: undefined,
      activeMembershipId: undefined,
      onboardingStatus: "approved",
      updatedAt: now,
    });
    await ctx.db.patch(group._id, { leaderProfileId: profile._id, updatedAt: now });
    return null;
  },
});

export const demoteLeader = mutation({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    const now = Date.now();

    if (profile.leaderGroupId) {
      const group = await ctx.db.get(profile.leaderGroupId);
      if (group?.leaderProfileId === profile._id) {
        await ctx.db.patch(group._id, { leaderProfileId: undefined, updatedAt: now });
      }
    }

    await ctx.db.patch(profile._id, {
      role: "member",
      leaderGroupId: undefined,
      onboardingStatus: profile.currentGroupId && profile.activeMembershipId ? "approved" : "needsGroup",
      updatedAt: now,
    });
    return null;
  },
});

export const assignMemberToGroup = mutation({
  args: {
    profileId: v.id("userProfiles"),
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await ctx.db.get(args.profileId);
    const group = await ctx.db.get(args.groupId);
    if (!profile) throw new Error("Profile not found");
    if (!group || !group.isActive) throw new Error("Active group not found");
    if (profile.role === "leader") throw new Error("Demote this leader before assigning member group membership");
    if (profile.currentGroupId === group._id && profile.activeMembershipId) return null;

    const now = Date.now();
    if (profile.activeMembershipId) {
      const oldMembership = await ctx.db.get(profile.activeMembershipId);
      if (oldMembership?.status === "active") {
        await ctx.db.patch(oldMembership._id, {
          status: "left",
          endedAt: now,
          endReason: "adminMoved",
        });
      }
    }

    const membershipId = await ctx.db.insert("memberships", {
      profileId: profile._id,
      groupId: group._id,
      status: "active",
      joinedAt: now,
    });
    await ctx.db.patch(profile._id, {
      currentGroupId: group._id,
      activeMembershipId: membershipId,
      onboardingStatus: "approved",
      updatedAt: now,
    });
    return null;
  },
});

export const removeMemberFromGroup = mutation({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    if (!profile.activeMembershipId) return null;

    const now = Date.now();
    await ctx.db.patch(profile.activeMembershipId, {
      status: "removed",
      endedAt: now,
      endReason: "removedByAdmin",
    });
    await ctx.db.patch(profile._id, {
      currentGroupId: undefined,
      activeMembershipId: undefined,
      onboardingStatus: "needsGroup",
      updatedAt: now,
    });
    return null;
  },
});

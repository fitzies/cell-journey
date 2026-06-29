import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { approvePendingJoinRequest, rejectPendingJoinRequest } from "./joinRequestFlow";
import { requireCurrentProfile, requireLeaderProfile } from "./profiles";

export const listServices = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("services")
      .withIndex("by_active_sort", (q) => q.eq("isActive", true))
      .order("asc")
      .take(50);
  },
});

export const getMyGroup = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCurrentProfile(ctx);
    const groupId = profile.role === "leader" ? profile.leaderGroupId : profile.currentGroupId;
    return groupId ? await ctx.db.get(groupId) : null;
  },
});

export const previewGroupByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    await requireCurrentProfile(ctx);
    const group = await ctx.db
      .query("groups")
      .withIndex("by_code", (q) => q.eq("code", args.code.trim()))
      .unique();
    if (!group || !group.isActive) return null;

    const leader = group.leaderProfileId ? await ctx.db.get(group.leaderProfileId) : null;
    return {
      _id: group._id,
      name: group.name,
      leaderName: leader?.preferredName || leader?.fullName || null,
    };
  },
});

export const requestToJoinByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    if (profile.role !== "member") throw new Error("Only members can request to join groups");
    if (!profile.fullName || !profile.singaporeRegion || profile.serviceIds.length === 0) {
      throw new Error("Complete your profile before joining a group");
    }
    if (profile.activeMembershipId || profile.currentGroupId) {
      throw new Error("Already in a group");
    }

    const group = await ctx.db
      .query("groups")
      .withIndex("by_code", (q) => q.eq("code", args.code.trim()))
      .unique();
    if (!group || !group.isActive) throw new Error("Invalid group code");

    const pending = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_status", (q) => q.eq("profileId", profile._id).eq("status", "pending"))
      .unique();

    const now = Date.now();
    if (pending) {
      if (pending.groupId === group._id) return pending;
      await ctx.db.patch(pending._id, { status: "cancelled", reviewedAt: now });
    }

    const requestId = await ctx.db.insert("joinRequests", {
      profileId: profile._id,
      groupId: group._id,
      status: "pending",
      requestedAt: now,
    });
    await ctx.db.patch(profile._id, { onboardingStatus: "pendingApproval", updatedAt: now });
    return await ctx.db.get(requestId);
  },
});

export const myPendingJoinRequest = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCurrentProfile(ctx);
    const request = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_status", (q) => q.eq("profileId", profile._id).eq("status", "pending"))
      .unique();
    if (!request) return null;
    return { request, group: await ctx.db.get(request.groupId) };
  },
});

export const listPendingJoinRequests = query({
  args: {},
  handler: async (ctx) => {
    const leader = await requireLeaderProfile(ctx);
    const requests = await ctx.db
      .query("joinRequests")
      .withIndex("by_group_status", (q) => q.eq("groupId", leader.leaderGroupId!).eq("status", "pending"))
      .take(100);

    const rows = [];
    for (const request of requests) {
      rows.push({ request, profile: await ctx.db.get(request.profileId) });
    }
    return rows;
  },
});

export const approveJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    return await approvePendingJoinRequest(ctx, args.joinRequestId, {
      expectedGroupId: leader.leaderGroupId!,
      reviewedByProfileId: leader._id,
    });
  },
});

export const rejectJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    return await rejectPendingJoinRequest(ctx, args.joinRequestId, {
      expectedGroupId: leader.leaderGroupId!,
      reviewedByProfileId: leader._id,
      reason: args.reason,
    });
  },
});

export const leaveCurrentGroup = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCurrentProfile(ctx);
    if (!profile.activeMembershipId) return null;
    const now = Date.now();
    await ctx.db.patch(profile.activeMembershipId, {
      status: "left",
      endedAt: now,
      endedByProfileId: profile._id,
      endReason: "left",
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

export const removeMember = mutation({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    const member = await ctx.db.get(args.profileId);
    if (!member || member.currentGroupId !== leader.leaderGroupId || !member.activeMembershipId) {
      throw new Error("Member not found in your group");
    }
    const now = Date.now();
    await ctx.db.patch(member.activeMembershipId, {
      status: "removed",
      endedAt: now,
      endedByProfileId: leader._id,
      endReason: "removedByLeader",
    });
    await ctx.db.patch(member._id, {
      currentGroupId: undefined,
      activeMembershipId: undefined,
      onboardingStatus: "needsGroup",
      updatedAt: now,
    });
    return null;
  },
});

export const listMyMembers = query({
  args: {},
  handler: async (ctx) => {
    const leader = await requireLeaderProfile(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_group_status", (q) => q.eq("groupId", leader.leaderGroupId!).eq("status", "active"))
      .take(200);
    const rows = [];
    for (const membership of memberships) {
      rows.push({ membership, profile: await ctx.db.get(membership.profileId) });
    }
    return rows;
  },
});

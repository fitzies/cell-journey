import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { approvePendingJoinRequest, rejectPendingJoinRequest } from "./joinRequestFlow";
import {
  getActiveMembershipForGroup,
  requireCurrentProfile,
  requireLeadershipForGroup,
} from "./profiles";

async function relationshipPatch(
  ctx: MutationCtx,
  profileId: Id<"userProfiles">,
  endedMembershipId?: Id<"memberships">,
) {
  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Profile not found");

  const nextMembership = await ctx.db
    .query("memberships")
    .withIndex("by_profile_status", (q) =>
      q.eq("profileId", profileId).eq("status", "active"),
    )
    .first();
  const pending = await ctx.db
    .query("joinRequests")
    .withIndex("by_profile_status", (q) =>
      q.eq("profileId", profileId).eq("status", "pending"),
    )
    .first();
  const ledGroup = await ctx.db
    .query("groups")
    .withIndex("by_leader", (q) => q.eq("leaderProfileId", profileId))
    .first();

  const compatibilityMembership = profile.activeMembershipId
    ? await ctx.db.get(profile.activeMembershipId)
    : null;
  const shouldReplaceCompatibilityMembership =
    !compatibilityMembership ||
    compatibilityMembership._id === endedMembershipId ||
    compatibilityMembership.profileId !== profile._id ||
    compatibilityMembership.status !== "active" ||
    compatibilityMembership.groupId !== profile.currentGroupId;

  return {
    ...(shouldReplaceCompatibilityMembership
      ? {
          activeMembershipId: nextMembership?._id,
          currentGroupId: nextMembership?.groupId,
        }
      : {}),
    onboardingStatus: !profile.fullName?.trim() || !profile.singaporeRegion || profile.serviceIds.length === 0
      ? ("profileIncomplete" as const)
      : nextMembership || ledGroup
        ? ("approved" as const)
        : pending
          ? ("pendingApproval" as const)
          : ("needsGroup" as const),
    updatedAt: Date.now(),
  };
}

export const listServices = query({
  args: {},
  handler: async (ctx) =>
    await ctx.db
      .query("services")
      .withIndex("by_active_sort", (q) => q.eq("isActive", true))
      .order("asc")
      .take(50),
});

export const listMine = query({
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
    return { memberGroups, ledGroups };
  },
});

/** Legacy single-group read for older clients. */
export const getMyGroup = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCurrentProfile(ctx);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .first();
    if (membership) return await ctx.db.get(membership.groupId);
    return await ctx.db
      .query("groups")
      .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
      .first();
  },
});

export const previewGroupByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    await requireCurrentProfile(ctx);
    const group = await ctx.db
      .query("groups")
      .withIndex("by_code", (q) => q.eq("code", args.code.trim().toUpperCase()))
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
    if (!profile.fullName || !profile.singaporeRegion || profile.serviceIds.length === 0) {
      throw new Error("Complete your profile before joining a group");
    }

    const group = await ctx.db
      .query("groups")
      .withIndex("by_code", (q) => q.eq("code", args.code.trim().toUpperCase()))
      .unique();
    if (!group || !group.isActive) throw new Error("Invalid group code");

    const membership = await getActiveMembershipForGroup(ctx, profile._id, group._id);
    if (membership) throw new Error("Already a member of this group");

    const pending = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_and_group_and_status", (q) =>
        q
          .eq("profileId", profile._id)
          .eq("groupId", group._id)
          .eq("status", "pending"),
      )
      .unique();
    if (pending) return pending;

    const now = Date.now();
    const requestId = await ctx.db.insert("joinRequests", {
      profileId: profile._id,
      groupId: group._id,
      status: "pending",
      requestedAt: now,
    });
    const anyMembership = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .first();
    await ctx.db.patch(profile._id, {
      onboardingStatus: anyMembership ? "approved" : "pendingApproval",
      updatedAt: now,
    });
    return await ctx.db.get(requestId);
  },
});

export const myPendingJoinRequests = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCurrentProfile(ctx);
    const requests = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "pending"),
      )
      .take(100);
    const rows = [];
    for (const request of requests) {
      const group = await ctx.db.get(request.groupId);
      if (group) rows.push({ request, group });
    }
    return rows;
  },
});

/** Legacy singular pending-request read. */
export const myPendingJoinRequest = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCurrentProfile(ctx);
    const request = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "pending"),
      )
      .first();
    if (!request) return null;
    return { request, group: await ctx.db.get(request.groupId) };
  },
});

export const cancelJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const request = await ctx.db.get(args.joinRequestId);
    if (!request || request.profileId !== profile._id || request.status !== "pending") {
      throw new Error("Join request not found");
    }
    await ctx.db.patch(request._id, { status: "cancelled", reviewedAt: Date.now() });
    await ctx.db.patch(profile._id, await relationshipPatch(ctx, profile._id));
    return null;
  },
});

async function pendingRowsForGroup(ctx: QueryCtx, groupId: Id<"groups">) {
  const requests = await ctx.db
    .query("joinRequests")
    .withIndex("by_group_status", (q) =>
      q.eq("groupId", groupId).eq("status", "pending"),
    )
    .take(100);
  const rows = [];
  for (const request of requests) {
    rows.push({ request, profile: await ctx.db.get(request.profileId) });
  }
  return rows;
}

export const listPendingJoinRequestsForGroup = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    await requireLeadershipForGroup(ctx, args.groupId);
    return await pendingRowsForGroup(ctx, args.groupId);
  },
});

/** Legacy signature retained until old single-group clients are retired. */
export const listPendingJoinRequests = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCurrentProfile(ctx);
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
      .take(2);
    if (groups.length !== 1) throw new Error("Select a group in the latest app version");
    return await pendingRowsForGroup(ctx, groups[0]._id);
  },
});

export const approveJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.joinRequestId);
    if (!request || (request.status !== "pending" && request.status !== "approved")) {
      throw new Error("Join request not found");
    }
    const { profile } = await requireLeadershipForGroup(ctx, request.groupId);
    return await approvePendingJoinRequest(ctx, args.joinRequestId, {
      expectedGroupId: request.groupId,
      reviewedByProfileId: profile._id,
    });
  },
});

export const rejectJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.joinRequestId);
    if (!request || request.status !== "pending") throw new Error("Join request not found");
    const { profile } = await requireLeadershipForGroup(ctx, request.groupId);
    return await rejectPendingJoinRequest(ctx, args.joinRequestId, {
      expectedGroupId: request.groupId,
      reviewedByProfileId: profile._id,
      reason: args.reason,
    });
  },
});

export const leaveGroup = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const membership = await getActiveMembershipForGroup(ctx, profile._id, args.groupId);
    if (!membership) return null;
    const now = Date.now();
    await ctx.db.patch(membership._id, {
      status: "left",
      endedAt: now,
      endedByProfileId: profile._id,
      endReason: "left",
    });
    await ctx.db.patch(
      profile._id,
      await relationshipPatch(ctx, profile._id, membership._id),
    );
    return null;
  },
});

/** Legacy mutation: safe only while exactly one active membership exists. */
export const leaveCurrentGroup = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCurrentProfile(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .take(2);
    if (memberships.length === 0) return null;
    if (memberships.length > 1) throw new Error("Select which group to leave in the latest app version");
    const membership = memberships[0];
    const now = Date.now();
    await ctx.db.patch(membership._id, {
      status: "left",
      endedAt: now,
      endedByProfileId: profile._id,
      endReason: "left",
    });
    await ctx.db.patch(
      profile._id,
      await relationshipPatch(ctx, profile._id, membership._id),
    );
    return null;
  },
});

async function removeMemberFromGroup(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  profileId: Id<"userProfiles">,
) {
  const { profile: leader } = await requireLeadershipForGroup(ctx, groupId);
  const membership = await getActiveMembershipForGroup(ctx, profileId, groupId);
  if (!membership) throw new Error("Member not found in this group");

  const now = Date.now();
  await ctx.db.patch(membership._id, {
    status: "removed",
    endedAt: now,
    endedByProfileId: leader._id,
    endReason: "removedByLeader",
  });
  await ctx.db.patch(
    profileId,
    await relationshipPatch(ctx, profileId, membership._id),
  );
  return null;
}

export const removeMemberFromGroupById = mutation({
  args: { groupId: v.id("groups"), profileId: v.id("userProfiles") },
  handler: async (ctx, args) =>
    await removeMemberFromGroup(ctx, args.groupId, args.profileId),
});

/** Legacy signature retained until old single-group clients are retired. */
export const removeMember = mutation({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
      .take(2);
    if (groups.length !== 1) throw new Error("Select a group in the latest app version");
    return await removeMemberFromGroup(ctx, groups[0]._id, args.profileId);
  },
});

export const listMembers = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    await requireLeadershipForGroup(ctx, args.groupId);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_group_status", (q) =>
        q.eq("groupId", args.groupId).eq("status", "active"),
      )
      .take(200);
    const rows = [];
    for (const membership of memberships) {
      rows.push({ membership, profile: await ctx.db.get(membership.profileId) });
    }
    return rows;
  },
});

/** Legacy single-led-group member list. */
export const listMyMembers = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCurrentProfile(ctx);
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
      .take(2);
    if (groups.length !== 1) throw new Error("Select a group in the latest app version");
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_group_status", (q) =>
        q.eq("groupId", groups[0]._id).eq("status", "active"),
      )
      .take(200);
    const rows = [];
    for (const membership of memberships) {
      rows.push({ membership, profile: await ctx.db.get(membership.profileId) });
    }
    return rows;
  },
});

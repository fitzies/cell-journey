import { withProfilePhoto } from "./lib/profilePhoto";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { GroupCapabilities } from "./profiles";
import { approvePendingJoinRequest, rejectPendingJoinRequest } from "./joinRequestFlow";
import {
  CO_LEADER_CAPABILITIES,
  OWNER_CAPABILITIES,
  getActiveMembershipForGroup,
  getConnectedMembershipForGroup,
  getProfileDisplayName,
  isProfileComplete,
  requireCurrentProfile,
  requireLeadershipForGroup,
} from "./profiles";
import { closeActivityPeriod, openActivityPeriod } from "./membershipActivity";
import {
  connectedMembershipsForGroup,
  nextSortOrder,
} from "./membershipOrdering";

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
  const inactiveMembership = nextMembership
    ? null
    : await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", profileId).eq("status", "inactive"),
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
  const coLeadership = await ctx.db
    .query("coLeaderAssignments")
    .withIndex("by_profile_and_status", (q) =>
      q.eq("profileId", profileId).eq("status", "active"),
    )
    .first();

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
    onboardingStatus: !isProfileComplete(profile)
      ? ("profileIncomplete" as const)
      : nextMembership || inactiveMembership || ledGroup || coLeadership
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
    const activeMemberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .take(100);
    const inactiveMemberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "inactive"),
      )
      .take(100);
    const memberGroups = [];
    for (const membership of [...activeMemberships, ...inactiveMemberships]) {
      const group = await ctx.db.get(membership.groupId);
      if (group?.isActive) memberGroups.push({ membership, group });
    }
    const ownedGroups = (
      await ctx.db
        .query("groups")
        .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
        .take(100)
    ).filter((group) => group.isActive);
    const ledGroups: Array<
      Doc<"groups"> & {
        accessRole: "owner" | "coLeader";
        capabilities: GroupCapabilities;
        assignmentId?: Id<"coLeaderAssignments">;
      }
    > = ownedGroups.map((group) => ({
      ...group,
      accessRole: "owner" as const,
      capabilities: OWNER_CAPABILITIES,
    }));
    const assignments = await ctx.db
      .query("coLeaderAssignments")
      .withIndex("by_profile_and_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .take(100);
    for (const assignment of assignments) {
      if (ownedGroups.some((group) => group._id === assignment.groupId)) continue;
      const group = await ctx.db.get(assignment.groupId);
      if (group?.isActive) ledGroups.push({
        ...group,
        accessRole: "coLeader" as const,
        capabilities: CO_LEADER_CAPABILITIES,
        assignmentId: assignment._id,
      });
    }
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
    const inactiveMembership = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "inactive"),
      )
      .first();
    if (inactiveMembership) return await ctx.db.get(inactiveMembership.groupId);
    const ownedGroup = await ctx.db
      .query("groups")
      .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
      .first();
    if (ownedGroup) return ownedGroup;
    const assignment = await ctx.db
      .query("coLeaderAssignments")
      .withIndex("by_profile_and_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .first();
    return assignment ? await ctx.db.get(assignment.groupId) : null;
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
      leaderName: leader ? getProfileDisplayName(leader) : null,
    };
  },
});

export const requestToJoinByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    if (!isProfileComplete(profile)) {
      throw new Error("Complete your profile before joining a group");
    }

    const group = await ctx.db
      .query("groups")
      .withIndex("by_code", (q) => q.eq("code", args.code.trim().toUpperCase()))
      .unique();
    if (!group || !group.isActive) throw new Error("Invalid group code");

    const membership = await getConnectedMembershipForGroup(ctx, profile._id, group._id);
    if (membership) throw new Error("Already connected to this group");

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
    const anyActiveMembership = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .first();
    const anyInactiveMembership = anyActiveMembership
      ? null
      : await ctx.db
          .query("memberships")
          .withIndex("by_profile_status", (q) =>
            q.eq("profileId", profile._id).eq("status", "inactive"),
          )
          .first();
    await ctx.db.patch(profile._id, {
      onboardingStatus:
        anyActiveMembership || anyInactiveMembership ? "approved" : "pendingApproval",
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
    rows.push({ request, profile: await withProfilePhoto(ctx, await ctx.db.get(request.profileId)) });
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
    const membership = await getConnectedMembershipForGroup(ctx, profile._id, args.groupId);
    if (!membership) return null;
    const now = Date.now();
    if (membership.status === "active") await closeActivityPeriod(ctx, membership, now);
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
    const activeMemberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .take(2);
    const inactiveMemberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "inactive"),
      )
      .take(2);
    const memberships = [...activeMemberships, ...inactiveMemberships];
    if (memberships.length === 0) return null;
    if (memberships.length > 1) throw new Error("Select which group to leave in the latest app version");
    const membership = memberships[0];
    const now = Date.now();
    if (membership.status === "active") await closeActivityPeriod(ctx, membership, now);
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
  const membership = await getConnectedMembershipForGroup(ctx, profileId, groupId);
  if (!membership) throw new Error("Member not found in this group");

  const now = Date.now();
  if (membership.status === "active") await closeActivityPeriod(ctx, membership, now);
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

export const markMemberInactive = mutation({
  args: { groupId: v.id("groups"), membershipId: v.id("memberships") },
  handler: async (ctx, args) => {
    const { profile: owner } = await requireLeadershipForGroup(ctx, args.groupId);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.groupId !== args.groupId || membership.status !== "active") {
      throw new Error("Active member not found in this group");
    }

    const now = Date.now();
    await closeActivityPeriod(ctx, membership, now);
    await ctx.db.patch(membership._id, {
      status: "inactive",
      endedAt: undefined,
      endedByProfileId: undefined,
      endReason: undefined,
      sortOrder: await nextSortOrder(ctx, args.groupId, "inactive"),
    });
    await ctx.db.patch(
      membership.profileId,
      await relationshipPatch(ctx, membership.profileId, membership._id),
    );
    return { membershipId: membership._id, changedByProfileId: owner._id };
  },
});

export const reactivateMember = mutation({
  args: { groupId: v.id("groups"), membershipId: v.id("memberships") },
  handler: async (ctx, args) => {
    const { profile: owner } = await requireLeadershipForGroup(ctx, args.groupId);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.groupId !== args.groupId || membership.status !== "inactive") {
      throw new Error("Inactive member not found in this group");
    }
    const current = await getConnectedMembershipForGroup(
      ctx,
      membership.profileId,
      membership.groupId,
    );
    if (!current || current._id !== membership._id) {
      throw new Error("Another current membership relationship already exists");
    }

    const now = Date.now();
    await openActivityPeriod(ctx, membership, now);
    await ctx.db.patch(membership._id, {
      status: "active",
      sortOrder: await nextSortOrder(ctx, args.groupId, "active"),
    });
    await ctx.db.patch(membership.profileId, {
      onboardingStatus: "approved",
      updatedAt: now,
    });
    return { membershipId: membership._id, changedByProfileId: owner._id };
  },
});

export const reorderMembers = mutation({
  args: {
    groupId: v.id("groups"),
    status: v.union(v.literal("active"), v.literal("inactive")),
    membershipIds: v.array(v.id("memberships")),
  },
  handler: async (ctx, args) => {
    await requireLeadershipForGroup(ctx, args.groupId);
    if (new Set(args.membershipIds).size !== args.membershipIds.length) {
      throw new Error("Membership IDs must be unique");
    }

    const section = await ctx.db
      .query("memberships")
      .withIndex("by_group_status", (q) =>
        q.eq("groupId", args.groupId).eq("status", args.status),
      )
      .take(501);
    if (section.length > 500) throw new Error("Member section is too large to reorder");
    if (
      section.length !== args.membershipIds.length ||
      section.some((membership) => !args.membershipIds.includes(membership._id))
    ) {
      throw new Error("Reorder must include every member in the selected status section");
    }

    for (let rank = 0; rank < args.membershipIds.length; rank += 1) {
      const membership = section.find((row) => row._id === args.membershipIds[rank]);
      if (!membership) throw new Error("Membership not found in selected section");
      if (membership.sortOrder !== rank) {
        await ctx.db.patch(membership._id, { sortOrder: rank });
      }
    }
    return null;
  },
});

export const listMembers = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    await requireLeadershipForGroup(ctx, args.groupId);
    const memberships = await connectedMembershipsForGroup(ctx, args.groupId);
    const rows = [];
    for (const membership of memberships) {
      rows.push({ membership, profile: await withProfilePhoto(ctx, await ctx.db.get(membership.profileId)) });
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
    const memberships = await connectedMembershipsForGroup(ctx, groups[0]._id);
    const rows = [];
    for (const membership of memberships) {
      rows.push({ membership, profile: await withProfilePhoto(ctx, await ctx.db.get(membership.profileId)) });
    }
    return rows;
  },
});

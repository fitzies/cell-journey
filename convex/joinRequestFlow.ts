import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { openActivityPeriod } from "./membershipActivity";
import { nextSortOrder } from "./membershipOrdering";
import { getConnectedMembershipForGroup, isProfileComplete } from "./profiles";

export type ReviewOptions = {
  expectedGroupId?: Id<"groups">;
  reviewedByProfileId?: Id<"userProfiles"> | null;
};

async function requirePendingRequest(
  ctx: MutationCtx,
  joinRequestId: Id<"joinRequests">,
  expectedGroupId?: Id<"groups">,
) {
  const request = await ctx.db.get(joinRequestId);
  if (!request || request.status !== "pending") throw new Error("Join request not found");
  if (expectedGroupId && request.groupId !== expectedGroupId) {
    throw new Error("Join request not found");
  }
  return request;
}

export async function approvePendingJoinRequest(
  ctx: MutationCtx,
  joinRequestId: Id<"joinRequests">,
  options: ReviewOptions = {},
) {
  const request = await ctx.db.get(joinRequestId);
  if (!request || (request.status !== "pending" && request.status !== "approved")) {
    throw new Error("Join request not found");
  }
  if (options.expectedGroupId && request.groupId !== options.expectedGroupId) {
    throw new Error("Join request not found");
  }
  const group = await ctx.db.get(request.groupId);
  if (!group || !group.isActive) throw new Error("Active group not found");

  const member = await ctx.db.get(request.profileId);
  if (!member) throw new Error("Member profile not found");

  const existing = await getConnectedMembershipForGroup(
    ctx,
    member._id,
    request.groupId,
  );

  const now = Date.now();
  if (request.status === "approved") {
    if (!existing) throw new Error("Approved request has no current membership");
    return existing;
  }
  if (existing?.status === "inactive") {
    throw new Error("Member already has a current inactive relationship with this group");
  }
  if (existing) {
    await ctx.db.patch(request._id, {
      status: "approved",
      reviewedAt: now,
      ...(options.reviewedByProfileId
        ? { reviewedByProfileId: options.reviewedByProfileId }
        : {}),
    });
    const pointer = member.activeMembershipId
      ? await ctx.db.get(member.activeMembershipId)
      : null;
    if (
      !pointer ||
      pointer.profileId !== member._id ||
      pointer.status !== "active" ||
      pointer.groupId !== member.currentGroupId
    ) {
      await ctx.db.patch(member._id, {
        currentGroupId: existing.groupId,
        activeMembershipId: existing._id,
        onboardingStatus: "approved",
        updatedAt: now,
      });
    }
    return existing;
  }

  const membershipId = await ctx.db.insert("memberships", {
    profileId: member._id,
    groupId: request.groupId,
    status: "active",
    joinedAt: now,
    sortOrder: await nextSortOrder(ctx, request.groupId, "active"),
    joinRequestId: request._id,
  });
  const membership = await ctx.db.get(membershipId);
  if (!membership) throw new Error("Membership was not created");
  await openActivityPeriod(ctx, membership, now);

  await ctx.db.patch(request._id, {
    status: "approved",
    reviewedAt: now,
    ...(options.reviewedByProfileId
      ? { reviewedByProfileId: options.reviewedByProfileId }
      : {}),
  });
  const compatibilityMembership = member.activeMembershipId
    ? await ctx.db.get(member.activeMembershipId)
    : null;
  const hasValidCompatibilityPair = Boolean(
    compatibilityMembership &&
      compatibilityMembership.profileId === member._id &&
      compatibilityMembership.status === "active" &&
      compatibilityMembership.groupId === member.currentGroupId,
  );
  await ctx.db.patch(member._id, {
    // Compatibility pointers are a paired legacy default, never authorization.
    ...(!hasValidCompatibilityPair
      ? { currentGroupId: request.groupId, activeMembershipId: membershipId }
      : {}),
    onboardingStatus: "approved",
    updatedAt: now,
  });

  return await ctx.db.get(membershipId);
}

export async function rejectPendingJoinRequest(
  ctx: MutationCtx,
  joinRequestId: Id<"joinRequests">,
  options: ReviewOptions & { reason?: string } = {},
) {
  const request = await requirePendingRequest(ctx, joinRequestId, options.expectedGroupId);
  const member = await ctx.db.get(request.profileId);
  if (!member) throw new Error("Member profile not found");

  const reason = options.reason?.trim();
  const now = Date.now();
  await ctx.db.patch(request._id, {
    status: "rejected",
    reviewedAt: now,
    ...(options.reviewedByProfileId
      ? { reviewedByProfileId: options.reviewedByProfileId }
      : {}),
    ...(reason ? { rejectionReason: reason } : {}),
  });

  const activeMembership = await ctx.db
    .query("memberships")
    .withIndex("by_profile_status", (q) =>
      q.eq("profileId", member._id).eq("status", "active"),
    )
    .first();
  const inactiveMembership = activeMembership
    ? null
    : await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", member._id).eq("status", "inactive"),
        )
        .first();
  const anotherPending = await ctx.db
    .query("joinRequests")
    .withIndex("by_profile_status", (q) =>
      q.eq("profileId", member._id).eq("status", "pending"),
    )
    .first();
  const ledGroup = await ctx.db
    .query("groups")
    .withIndex("by_leader", (q) => q.eq("leaderProfileId", member._id))
    .first();

  const coLeadership = await ctx.db
    .query("coLeaderAssignments")
    .withIndex("by_profile_and_status", (q) =>
      q.eq("profileId", member._id).eq("status", "active"),
    )
    .first();
  const profileComplete = isProfileComplete(member);
  await ctx.db.patch(member._id, {
    onboardingStatus: !profileComplete
      ? "profileIncomplete"
      : activeMembership || inactiveMembership || ledGroup || coLeadership
        ? "approved"
        : anotherPending
          ? "pendingApproval"
          : "needsGroup",
    updatedAt: now,
  });

  return null;
}

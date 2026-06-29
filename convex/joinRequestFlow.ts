import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

type ReviewOptions = {
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
  if (expectedGroupId && request.groupId !== expectedGroupId) throw new Error("Join request not found");
  return request;
}

export async function approvePendingJoinRequest(
  ctx: MutationCtx,
  joinRequestId: Id<"joinRequests">,
  options: ReviewOptions = {},
) {
  const request = await requirePendingRequest(ctx, joinRequestId, options.expectedGroupId);

  const group = await ctx.db.get(request.groupId);
  if (!group || !group.isActive) throw new Error("Active group not found");

  const member = await ctx.db.get(request.profileId);
  if (!member) throw new Error("Member profile not found");
  if (member.role === "leader") throw new Error("Leaders cannot be approved as group members");

  const active = await ctx.db
    .query("memberships")
    .withIndex("by_profile_status", (q) => q.eq("profileId", member._id).eq("status", "active"))
    .unique();
  if (active) throw new Error("Member is already in a group");

  const now = Date.now();
  const membershipId = await ctx.db.insert("memberships", {
    profileId: member._id,
    groupId: request.groupId,
    status: "active",
    joinedAt: now,
    joinRequestId: request._id,
  });

  await ctx.db.patch(request._id, {
    status: "approved",
    reviewedAt: now,
    ...(options.reviewedByProfileId ? { reviewedByProfileId: options.reviewedByProfileId } : {}),
  });
  await ctx.db.patch(member._id, {
    currentGroupId: request.groupId,
    activeMembershipId: membershipId,
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

  const active = await ctx.db
    .query("memberships")
    .withIndex("by_profile_status", (q) => q.eq("profileId", member._id).eq("status", "active"))
    .unique();
  const reason = options.reason?.trim();
  const now = Date.now();

  await ctx.db.patch(request._id, {
    status: "rejected",
    reviewedAt: now,
    ...(options.reviewedByProfileId ? { reviewedByProfileId: options.reviewedByProfileId } : {}),
    ...(reason ? { rejectionReason: reason } : {}),
  });

  if (member.role === "member" && !member.leaderGroupId && !active && !member.currentGroupId && !member.activeMembershipId) {
    await ctx.db.patch(member._id, { onboardingStatus: "needsGroup", updatedAt: now });
  }

  return null;
}

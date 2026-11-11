import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getConnectedMembershipForGroup, isProfileComplete, normalizeEmail } from "./profiles";
import { nextSortOrder } from "./membershipOrdering";
import { personalDetailsPatch, type PersonalDetailsInput } from "./personalDetails";

type AuthUser = Doc<"users"> & { email?: string };

export function validateInviteEmail(value: string) {
  const email = normalizeEmail(value);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address");
  }
  return email;
}

/** Every live profile that already uses this normalized email address. */
export async function findProfilesByEmail(ctx: MutationCtx, email: string) {
  const [invitedMatches, identityMatches, authUsers] = await Promise.all([
    ctx.db
      .query("userProfiles")
      .withIndex("by_invitedEmail", (q) => q.eq("invitedEmail", email))
      .take(2),
    ctx.db
      .query("userProfiles")
      .withIndex("by_identityEmailNormalized", (q) => q.eq("identityEmailNormalized", email))
      .take(2),
    ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).take(2),
  ]);

  const matchingProfiles = new Map(
    [...invitedMatches, ...identityMatches].map((profile) => [profile._id, profile]),
  );

  // Transitional safeguard for profiles created before normalized identity
  // emails were stored. Convex Auth preserves provider casing, so the users
  // email index alone cannot detect every case-insensitive match.
  const legacyLinkedProfiles = ctx.db
    .query("userProfiles")
    .withIndex("by_identityEmailNormalized", (q) => q.eq("identityEmailNormalized", undefined));
  for await (const profile of legacyLinkedProfiles) {
    if (!profile.userId) continue;
    const linkedUser = (await ctx.db.get(profile.userId)) as AuthUser | null;
    if (linkedUser?.email && normalizeEmail(linkedUser.email) === email) {
      matchingProfiles.set(profile._id, profile);
    }
  }

  for (const authUser of authUsers) {
    const linkedProfiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", authUser._id))
      .take(2);
    for (const profile of linkedProfiles) matchingProfiles.set(profile._id, profile);
  }
  return [...matchingProfiles.values()].filter((profile) => profile.deletedAt === undefined);
}

/** Creates a profile that its owner claims by signing in with `email`. */
export async function insertInvitedProfile(
  ctx: MutationCtx,
  args: {
    firstName: string;
    lastName: string;
    email: string;
    invitedByUserId?: Id<"users">;
  } & PersonalDetailsInput,
) {
  const firstName = args.firstName.trim();
  const lastName = args.lastName.trim();
  if (!firstName || !lastName) throw new Error("First and last name are required");
  const email = validateInviteEmail(args.email);
  const details = personalDetailsPatch(args);

  if ((await findProfilesByEmail(ctx, email)).length > 0) {
    throw new Error("A profile already uses this email address");
  }

  const now = Date.now();
  const profileId = await ctx.db.insert("userProfiles", {
    invitedEmail: email,
    invitedAt: now,
    ...(args.invitedByUserId ? { invitedByUserId: args.invitedByUserId } : {}),
    role: "member",
    onboardingStatus: "profileIncomplete",
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    serviceIds: [],
    ...details,
    createdAt: now,
    updatedAt: now,
  });
  return profileId;
}

/**
 * Gives a profile an active membership in a group, approving any pending
 * request. Returns false when the person is already connected to the group.
 */
export async function addProfileToGroup(
  ctx: MutationCtx,
  profileId: Id<"userProfiles">,
  groupId: Id<"groups">,
  reviewedByProfileId?: Id<"userProfiles">,
) {
  const existing = await getConnectedMembershipForGroup(ctx, profileId, groupId);
  const pending = await ctx.db
    .query("joinRequests")
    .withIndex("by_profile_and_group_and_status", (q) =>
      q.eq("profileId", profileId).eq("groupId", groupId).eq("status", "pending"),
    )
    .unique();

  const now = Date.now();
  if (!existing) {
    const membershipId = await ctx.db.insert("memberships", {
      profileId,
      groupId,
      status: "active",
      joinedAt: now,
      sortOrder: await nextSortOrder(ctx, groupId, "active"),
      ...(pending ? { joinRequestId: pending._id } : {}),
    });
    await ctx.db.insert("membershipActivityPeriods", {
      membershipId,
      profileId,
      groupId,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (pending) {
    await ctx.db.patch(pending._id, {
      status: "approved",
      reviewedAt: now,
      ...(reviewedByProfileId ? { reviewedByProfileId } : {}),
    });
  }
  await syncCompatibilityRole(ctx, profileId);
  return !existing;
}

/** Keeps the deprecated role/onboarding fields in step with relationships. */
export async function syncCompatibilityRole(ctx: MutationCtx, profileId: Id<"userProfiles">) {
  const profile = await ctx.db.get(profileId);
  if (!profile) return;
  const ledGroup = await ctx.db
    .query("groups")
    .withIndex("by_leader", (q) => q.eq("leaderProfileId", profileId))
    .first();
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_profile_status", (q) => q.eq("profileId", profileId).eq("status", "active"))
    .first();
  const inactiveMembership = membership
    ? null
    : await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) => q.eq("profileId", profileId).eq("status", "inactive"))
        .first();
  const coLeadership = await ctx.db
    .query("coLeaderAssignments")
    .withIndex("by_profile_and_status", (q) => q.eq("profileId", profileId).eq("status", "active"))
    .first();
  const pending = await ctx.db
    .query("joinRequests")
    .withIndex("by_profile_status", (q) => q.eq("profileId", profileId).eq("status", "pending"))
    .first();
  const compatibilityMembership = profile.activeMembershipId
    ? await ctx.db.get(profile.activeMembershipId)
    : null;
  const shouldReplaceCompatibilityMembership =
    !compatibilityMembership ||
    compatibilityMembership.profileId !== profile._id ||
    compatibilityMembership.status !== "active" ||
    compatibilityMembership.groupId !== profile.currentGroupId;
  const profileComplete = isProfileComplete(profile);
  await ctx.db.patch(profileId, {
    role: ledGroup || coLeadership ? "leader" : "member",
    leaderGroupId: ledGroup?._id,
    ...(shouldReplaceCompatibilityMembership
      ? { activeMembershipId: membership?._id, currentGroupId: membership?.groupId }
      : {}),
    onboardingStatus: !profileComplete
      ? "profileIncomplete"
      : ledGroup || coLeadership || membership || inactiveMembership
        ? "approved"
        : pending
          ? "pendingApproval"
          : "needsGroup",
    updatedAt: Date.now(),
  });
}

/** Emails someone who was added to a group. Delivery happens in the background. */
export async function scheduleGroupInviteEmail(
  ctx: MutationCtx,
  args: {
    email: string;
    firstName: string;
    groupName: string;
    addedByName: string | null;
    isNewAccount: boolean;
  },
) {
  await ctx.scheduler.runAfter(0, internal.inviteEmails.sendGroupInvite, args);
}

import { getAuthUserId } from "@convex-dev/auth/server";
import { getPostalDistrictFromSector } from "@cell-journey/domain";
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

function cleanName(value: string | undefined) {
  return value?.trim() ?? "";
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function uniqueProfileByUserId(ctx: DbCtx, userId: Id<"users">) {
  const profiles = await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(2);
  if (profiles.length > 1) {
    throw new Error("Multiple profiles are linked to this account");
  }
  return profiles[0] ?? null;
}

async function uniqueProfileByNormalizedEmail(
  ctx: DbCtx,
  index: "by_invitedEmail" | "by_identityEmailNormalized",
  field: "invitedEmail" | "identityEmailNormalized",
  email: string,
) {
  const profiles = await ctx.db
    .query("userProfiles")
    .withIndex(index, (q) => q.eq(field, email))
    .take(2);
  if (profiles.length > 1) {
    throw new Error("Multiple profiles use this email address");
  }
  return profiles[0] ?? null;
}

/**
 * Claims a pre-provisioned profile for a verified Convex Auth user.
 * The caller supplies only the server-derived auth user ID; this helper reads
 * verification and email state from the managed users table.
 */
export async function claimInvitedProfileForAuthUser(
  ctx: MutationCtx,
  userId: Id<"users">,
) {
  const linkedProfile = await uniqueProfileByUserId(ctx, userId);
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Authenticated user not found");

  if (typeof user.emailVerificationTime !== "number" || !user.email) {
    return linkedProfile;
  }

  const email = normalizeEmail(user.email);
  if (!email) return linkedProfile;

  const invitedProfile = await uniqueProfileByNormalizedEmail(
    ctx,
    "by_invitedEmail",
    "invitedEmail",
    email,
  );
  const identityProfile = await uniqueProfileByNormalizedEmail(
    ctx,
    "by_identityEmailNormalized",
    "identityEmailNormalized",
    email,
  );

  if (linkedProfile) {
    if (invitedProfile && invitedProfile._id !== linkedProfile._id) {
      throw new Error("This verified email belongs to a different invited profile");
    }
    if (identityProfile && identityProfile._id !== linkedProfile._id) {
      throw new Error("This verified email belongs to a different account");
    }

    const shouldMarkClaimed =
      linkedProfile.invitedEmail === email && linkedProfile.claimedAt === undefined;
    if (
      linkedProfile.identityEmailNormalized !== email ||
      shouldMarkClaimed
    ) {
      const now = Date.now();
      await ctx.db.patch(linkedProfile._id, {
        identityEmailNormalized: email,
        ...(shouldMarkClaimed ? { claimedAt: now } : {}),
        updatedAt: now,
      });
      return await ctx.db.get(linkedProfile._id);
    }
    return linkedProfile;
  }

  if (identityProfile) {
    throw new Error("This verified email belongs to a different account");
  }
  if (!invitedProfile) return null;
  if (invitedProfile.userId && invitedProfile.userId !== userId) {
    throw new Error("This invited profile is already linked to another account");
  }

  const now = Date.now();
  await ctx.db.patch(invitedProfile._id, {
    userId,
    identityEmailNormalized: email,
    claimedAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(invitedProfile._id);
}

export function hasCompleteName(profile: Doc<"userProfiles">) {
  const firstName = cleanName(profile.firstName);
  const lastName = cleanName(profile.lastName);
  if (firstName || lastName) return Boolean(firstName && lastName);
  return Boolean(cleanName(profile.fullName));
}

export function getProfileDisplayName(profile: Doc<"userProfiles">) {
  const preferredName = cleanName(profile.preferredName);
  if (preferredName) return preferredName;
  const structuredName = [cleanName(profile.firstName), cleanName(profile.lastName)]
    .filter(Boolean)
    .join(" ");
  return structuredName || cleanName(profile.fullName) || null;
}

export function isProfileComplete(profile: Doc<"userProfiles">) {
  return Boolean(
    hasCompleteName(profile) &&
      (profile.postalDistrict || profile.singaporeRegion) &&
      profile.serviceIds.length > 0,
  );
}

export const OWNER_CAPABILITIES = {
  readSchedule: true,
  createEvents: true,
  importEvents: true,
  updateEvents: true,
  cancelEvents: true,
  readAttendance: true,
  markAttendance: true,
  manageJoinRequests: true,
  manageMembers: true,
  reorderMembers: true,
  changeGroup: true,
} as const;

export const CO_LEADER_CAPABILITIES = {
  readSchedule: true,
  createEvents: true,
  importEvents: true,
  updateEvents: false,
  cancelEvents: false,
  readAttendance: true,
  markAttendance: true,
  manageJoinRequests: false,
  manageMembers: false,
  reorderMembers: false,
  changeGroup: false,
} as const;

export type GroupCapability = keyof typeof OWNER_CAPABILITIES;
export type GroupCapabilities = Record<GroupCapability, boolean>;

export async function getCurrentProfile(ctx: DbCtx) {
  const userId = await requireAuthUserId(ctx);
  return await uniqueProfileByUserId(ctx, userId);
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

export async function getConnectedMembershipForGroup(
  ctx: DbCtx,
  profileId: Id<"userProfiles">,
  groupId: Id<"groups">,
) {
  const active = await getActiveMembershipForGroup(ctx, profileId, groupId);
  const inactive = await ctx.db
    .query("memberships")
    .withIndex("by_profile_and_group_and_status", (q) =>
      q.eq("profileId", profileId).eq("groupId", groupId).eq("status", "inactive"),
    )
    .unique();
  if (active && inactive) throw new Error("Duplicate current membership relationships");
  return active ?? inactive;
}

export async function getLeadershipAccessForGroup(
  ctx: DbCtx,
  profileId: Id<"userProfiles">,
  groupId: Id<"groups">,
) {
  const group = await ctx.db.get(groupId);
  if (!group || !group.isActive) return null;
  if (group.leaderProfileId === profileId) {
    return { group, accessRole: "owner" as const, capabilities: OWNER_CAPABILITIES };
  }
  const assignment = await ctx.db
    .query("coLeaderAssignments")
    .withIndex("by_profile_and_group_and_status", (q) =>
      q.eq("profileId", profileId).eq("groupId", groupId).eq("status", "active"),
    )
    .unique();
  if (!assignment) return null;
  return {
    group,
    assignment,
    accessRole: "coLeader" as const,
    capabilities: CO_LEADER_CAPABILITIES,
  };
}

export async function requireGroupCapability(
  ctx: DbCtx,
  groupId: Id<"groups">,
  capability: GroupCapability,
) {
  const profile = await requireCurrentProfile(ctx);
  const access = await getLeadershipAccessForGroup(ctx, profile._id, groupId);
  if (!access || !access.capabilities[capability]) throw new Error("Unauthorized");
  return { profile, ...access };
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

function validateProfileName(
  profile: Doc<"userProfiles">,
  names: { firstName?: string; lastName?: string; fullName?: string },
  allowLegacyNameWrite: boolean,
) {
  const firstName = cleanName(names.firstName);
  const lastName = cleanName(names.lastName);
  const submittedStructuredName = Boolean(firstName || lastName);
  if (submittedStructuredName && (!firstName || !lastName)) {
    throw new Error("First and last name are required");
  }

  const submittedFullName = cleanName(names.fullName);
  const preservesStructuredName =
    !submittedStructuredName &&
    Boolean(cleanName(profile.firstName) && cleanName(profile.lastName)) &&
    submittedFullName === cleanName(profile.fullName);
  if (!submittedStructuredName) {
    if (!allowLegacyNameWrite && !preservesStructuredName) {
      throw new Error("First and last name are required");
    }
    if (!submittedFullName) throw new Error("Full name is required");
    if (
      allowLegacyNameWrite &&
      (profile.firstName || profile.lastName) &&
      submittedFullName !== cleanName(profile.fullName)
    ) {
      throw new Error("Use first and last name to change this profile name");
    }
  }

  return {
    firstName: submittedStructuredName ? firstName : profile.firstName,
    lastName: submittedStructuredName ? lastName : profile.lastName,
    fullName: submittedStructuredName ? `${firstName} ${lastName}` : submittedFullName,
  };
}

async function validateProfileServices(ctx: MutationCtx, serviceIds: Id<"services">[]) {
  const uniqueServiceIds = [...new Set(serviceIds)];
  if (uniqueServiceIds.length === 0) throw new Error("Select at least one service");

  for (const serviceId of uniqueServiceIds) {
    const service = await ctx.db.get(serviceId);
    if (!service || !service.isActive) throw new Error("Invalid service selected");
  }

  return uniqueServiceIds;
}

async function validateProfileInput(
  ctx: MutationCtx,
  profile: Doc<"userProfiles">,
  names: { firstName?: string; lastName?: string; fullName?: string },
  serviceIds: Id<"services">[],
  allowLegacyNameWrite: boolean,
) {
  const validatedNames = validateProfileName(profile, names, allowLegacyNameWrite);
  const uniqueServiceIds = await validateProfileServices(ctx, serviceIds);
  return { ...validatedNames, uniqueServiceIds };
}

function getCompatibilityOnboardingStatus(profile: Doc<"userProfiles">) {
  if (!isProfileComplete(profile)) return "profileIncomplete" as const;
  if (profile.currentGroupId && profile.activeMembershipId) return "approved" as const;
  if (profile.onboardingStatus === "pendingApproval") return "pendingApproval" as const;
  // Relationship mutations are responsible for moving approved profiles back
  // to needsGroup; profile-only edits must not drop inactive/co-leader access.
  if (profile.onboardingStatus === "approved") return "approved" as const;
  if (profile.role === "leader") return "approved" as const;
  return "needsGroup" as const;
}

export const getOrCreateCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const existing = await claimInvitedProfileForAuthUser(ctx, userId);

    if (existing) return existing;

    const now = Date.now();
    const user = await ctx.db.get(userId);
    const identityEmailNormalized =
      user && typeof user.emailVerificationTime === "number" && user.email
        ? normalizeEmail(user.email)
        : undefined;
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      ...(identityEmailNormalized ? { identityEmailNormalized } : {}),
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
    return await uniqueProfileByUserId(ctx, userId);
  },
});

export const currentContext = query({
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
    const coLeaderAssignments = await ctx.db
      .query("coLeaderAssignments")
      .withIndex("by_profile_and_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .take(100);
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
    for (const assignment of coLeaderAssignments) {
      if (ownedGroups.some((group) => group._id === assignment.groupId)) continue;
      const group = await ctx.db.get(assignment.groupId);
      if (group?.isActive) {
        ledGroups.push({
          ...group,
          accessRole: "coLeader" as const,
          capabilities: CO_LEADER_CAPABILITIES,
          assignmentId: assignment._id,
        });
      }
    }

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

const legacyProfileWriteArgs = {
  fullName: v.string(),
  preferredName: v.optional(v.string()),
  singaporeRegion,
  serviceIds: v.array(v.id("services")),
};

const structuredProfileWriteArgs = {
  firstName: v.string(),
  lastName: v.string(),
  preferredName: v.optional(v.string()),
  singaporeRegion,
  serviceIds: v.array(v.id("services")),
};

const structuredPostalProfileWriteArgs = {
  firstName: v.string(),
  lastName: v.string(),
  preferredName: v.optional(v.string()),
  postalSector: v.string(),
  serviceIds: v.array(v.id("services")),
};

const editablePostalProfileWriteArgs = {
  firstName: v.string(),
  lastName: v.string(),
  preferredName: v.optional(v.string()),
  postalSector: v.optional(v.string()),
  serviceIds: v.array(v.id("services")),
};

type LocationInput =
  | { singaporeRegion: NonNullable<Doc<"userProfiles">["singaporeRegion"]> }
  | { postalSector: string }
  | { preserveLocation: true };

async function updateProfileFields(
  ctx: MutationCtx,
  args: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    preferredName?: string;
    serviceIds: Id<"services">[];
  },
  location: LocationInput,
  allowLegacyNameWrite: boolean,
) {
  const profile = await requireCurrentProfile(ctx);
  const names = await validateProfileInput(
    ctx,
    profile,
    args,
    args.serviceIds,
    allowLegacyNameWrite,
  );
  const now = Date.now();
  const locationPatch = "postalSector" in location
    ? (() => {
        const district = getPostalDistrictFromSector(location.postalSector);
        if (!district) throw new Error("Enter a valid two-digit postal sector");
        return {
          postalDistrict: district.code,
          singaporeRegion: undefined,
        };
      })()
    : "singaporeRegion" in location
      ? { singaporeRegion: location.singaporeRegion }
      : {};
  const effectiveLocation = { ...profile, ...locationPatch };
  if (!effectiveLocation.postalDistrict && !effectiveLocation.singaporeRegion) {
    throw new Error("Enter the first two digits of your Singapore postal code");
  }
  const patch = {
    firstName: names.firstName,
    lastName: names.lastName,
    fullName: names.fullName,
    preferredName: args.preferredName?.trim() || undefined,
    serviceIds: names.uniqueServiceIds,
    ...locationPatch,
    updatedAt: now,
  };
  await ctx.db.patch(profile._id, {
    ...patch,
    onboardingStatus: getCompatibilityOnboardingStatus({ ...profile, ...patch }),
  });
  return await ctx.db.get(profile._id);
}

/** @deprecated Use updateOnboardingProfileV2 for structured-name writes. */
export const updateOnboardingProfile = mutation({
  args: legacyProfileWriteArgs,
  handler: async (ctx, args) =>
    await updateProfileFields(ctx, args, { singaporeRegion: args.singaporeRegion }, true),
});

/** @deprecated Use updateProfileV2 for structured-name writes. */
export const updateProfile = mutation({
  args: legacyProfileWriteArgs,
  handler: async (ctx, args) =>
    await updateProfileFields(ctx, args, { singaporeRegion: args.singaporeRegion }, true),
});

export const updateOnboardingProfileV2 = mutation({
  args: structuredProfileWriteArgs,
  handler: async (ctx, args) =>
    await updateProfileFields(ctx, args, { singaporeRegion: args.singaporeRegion }, false),
});

export const updateProfileV2 = mutation({
  args: structuredProfileWriteArgs,
  handler: async (ctx, args) =>
    await updateProfileFields(ctx, args, { singaporeRegion: args.singaporeRegion }, false),
});

export const updateOnboardingProfileV3 = mutation({
  args: structuredPostalProfileWriteArgs,
  handler: async (ctx, args) =>
    await updateProfileFields(ctx, args, { postalSector: args.postalSector }, false),
});

export const updateProfileV3 = mutation({
  args: editablePostalProfileWriteArgs,
  handler: async (ctx, args) =>
    await updateProfileFields(
      ctx,
      args,
      args.postalSector === undefined
        ? { preserveLocation: true }
        : { postalSector: args.postalSector },
      false,
    ),
});

/** Edits one profile detail without resubmitting unrelated client snapshot fields. */
export const updateProfileField = mutation({
  args: {
    change: v.union(
      v.object({ field: v.literal("name"), firstName: v.string(), lastName: v.string() }),
      v.object({ field: v.literal("services"), serviceIds: v.array(v.id("services")) }),
      v.object({ field: v.literal("postal"), postalSector: v.string() }),
    ),
  },
  handler: async (ctx, { change }) => {
    const profile = await requireCurrentProfile(ctx);
    let patch: Partial<Doc<"userProfiles">>;
    if (change.field === "name") {
      patch = validateProfileName(profile, change, false);
    } else if (change.field === "services") {
      patch = { serviceIds: await validateProfileServices(ctx, change.serviceIds) };
    } else {
      const district = getPostalDistrictFromSector(change.postalSector);
      if (!district) throw new Error("Enter a valid two-digit postal sector");
      patch = { postalDistrict: district.code, singaporeRegion: undefined };
    }
    await ctx.db.patch(profile._id, {
      ...patch,
      updatedAt: Date.now(),
      onboardingStatus: getCompatibilityOnboardingStatus({ ...profile, ...patch }),
    });
    return await ctx.db.get(profile._id);
  },
});

export type ProfileId = Id<"userProfiles">;

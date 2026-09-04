import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

export const DEV_TEST_GROUP_CODE = "DEV001";
export const DEV_TEST_GROUP_NAME = "Cell Journey Dev Test Group";
export const DEV_TEST_PROFILE_NAME = "Cell Journey Dev Tester";
export const DEV_TEST_SERVICE_NAME = "Dev Test Service";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function requireEnabledDevEmail(email: string) {
  if (process.env.AUTH_DEV_LOGIN_ENABLED !== "true") {
    throw new Error("Development account provisioning is disabled");
  }

  const configuredEmail = normalizeEmail(process.env.AUTH_DEV_EMAIL ?? "");
  if (!configuredEmail || configuredEmail !== normalizeEmail(email)) {
    throw new Error("Development account email does not match");
  }
  return configuredEmail;
}

async function getServiceId(ctx: MutationCtx, now: number) {
  const activeServices = await ctx.db
    .query("services")
    .withIndex("by_active_sort", (q) => q.eq("isActive", true))
    .take(1);
  if (activeServices[0]) return activeServices[0]._id;

  return await ctx.db.insert("services", {
    name: DEV_TEST_SERVICE_NAME,
    sortOrder: 1_000_000,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function getOrCreateProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  email: string,
  now: number,
) {
  const linkedProfiles = await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(2);
  if (linkedProfiles.length > 1) {
    throw new Error("Multiple profiles are linked to the dev account");
  }

  const existing = linkedProfiles[0];
  const serviceIds =
    existing && existing.serviceIds.length > 0
      ? existing.serviceIds
      : [await getServiceId(ctx, now)];

  const profileFields = {
    userId,
    identityEmailNormalized: email,
    role: "leader" as const,
    onboardingStatus: "approved" as const,
    fullName: DEV_TEST_PROFILE_NAME,
    firstName: "Cell Journey Dev",
    lastName: "Tester",
    preferredName: "Dev Tester",
    singaporeRegion: "central" as const,
    postalDistrict: "D09" as const,
    serviceIds,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, profileFields);
    return existing._id;
  }

  return await ctx.db.insert("userProfiles", {
    ...profileFields,
    createdAt: now,
  });
}

async function getOrCreateGroup(
  ctx: MutationCtx,
  profileId: Id<"userProfiles">,
  now: number,
) {
  const matchingGroups = await ctx.db
    .query("groups")
    .withIndex("by_code", (q) => q.eq("code", DEV_TEST_GROUP_CODE))
    .take(2);
  if (matchingGroups.length > 1) {
    throw new Error("Multiple groups use the reserved dev group code");
  }

  const group = matchingGroups[0];
  if (!group) {
    return await ctx.db.insert("groups", {
      name: DEV_TEST_GROUP_NAME,
      code: DEV_TEST_GROUP_CODE,
      leaderProfileId: profileId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (group.name !== DEV_TEST_GROUP_NAME) {
    throw new Error("The reserved dev group code is already in use");
  }
  if (group.leaderProfileId && group.leaderProfileId !== profileId) {
    throw new Error("The dev test group belongs to another profile");
  }

  await ctx.db.patch(group._id, {
    leaderProfileId: profileId,
    isActive: true,
    updatedAt: now,
  });
  return group._id;
}

async function getOrCreateMembership(
  ctx: MutationCtx,
  profileId: Id<"userProfiles">,
  groupId: Id<"groups">,
  now: number,
) {
  const activeMemberships = await ctx.db
    .query("memberships")
    .withIndex("by_profile_and_group_and_status", (q) =>
      q
        .eq("profileId", profileId)
        .eq("groupId", groupId)
        .eq("status", "active"),
    )
    .take(2);
  if (activeMemberships.length > 1) {
    throw new Error("Multiple active dev test memberships exist");
  }

  const existing = activeMemberships[0];
  const membershipId =
    existing?._id ??
    (await ctx.db.insert("memberships", {
      profileId,
      groupId,
      status: "active",
      joinedAt: now,
      sortOrder: now,
    }));
  const membership = existing ?? (await ctx.db.get(membershipId));
  if (!membership) throw new Error("Could not create dev test membership");

  const activityPeriods = await ctx.db
    .query("membershipActivityPeriods")
    .withIndex("by_membership_and_startedAt", (q) =>
      q.eq("membershipId", membershipId),
    )
    .take(1);
  if (!activityPeriods[0]) {
    await ctx.db.insert("membershipActivityPeriods", {
      membershipId,
      profileId,
      groupId,
      startedAt: membership.joinedAt,
      createdAt: now,
      updatedAt: now,
    });
  }
  return membershipId;
}

export const provision = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
  },
  handler: async (ctx, { userId, email }) => {
    const normalizedEmail = requireEnabledDevEmail(email);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Authenticated dev user not found");
    if (
      typeof user.emailVerificationTime !== "number" ||
      !user.email ||
      normalizeEmail(user.email) !== normalizedEmail
    ) {
      throw new Error("Development account must have a verified matching email");
    }

    const now = Date.now();
    const profileId = await getOrCreateProfile(
      ctx,
      userId,
      normalizedEmail,
      now,
    );
    const groupId = await getOrCreateGroup(ctx, profileId, now);
    const membershipId = await getOrCreateMembership(
      ctx,
      profileId,
      groupId,
      now,
    );

    await ctx.db.patch(profileId, {
      currentGroupId: groupId,
      activeMembershipId: membershipId,
      leaderGroupId: groupId,
      onboardingStatus: "approved",
      role: "leader",
      updatedAt: now,
    });

    return { profileId, groupId, membershipId };
  },
});

import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(v.literal("member"), v.literal("leader"));
const onboardingStatus = v.union(
  v.literal("profileIncomplete"),
  v.literal("needsGroup"),
  v.literal("pendingApproval"),
  v.literal("approved"),
);
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
const joinRequestStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("cancelled"),
);
const membershipStatus = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("left"),
  v.literal("removed"),
);
const coLeaderAssignmentStatus = v.union(
  v.literal("active"),
  v.literal("revoked"),
);
const attendanceStatus = v.union(v.literal("present"), v.literal("absent"));
const pushPlatform = v.union(
  v.literal("ios"),
  v.literal("android"),
  v.literal("web"),
);

export default defineSchema({
  ...authTables,

  userProfiles: defineTable({
    // Links product profile data to the Convex Auth managed users table.
    // Optional so admins can pre-provision a profile before its owner signs in.
    userId: v.optional(v.id("users")),

    // Pre-provisioned profiles keep their normalized invite address until claimed.
    // Auth-linked profiles store the normalized verified identity email separately.
    invitedEmail: v.optional(v.string()),
    identityEmailNormalized: v.optional(v.string()),
    invitedAt: v.optional(v.number()),
    invitedByUserId: v.optional(v.id("users")),
    claimedAt: v.optional(v.number()),

    // Deprecated compatibility fields for clients deployed before multi-group support.
    // Authorization and capabilities come from memberships and groups.leaderProfileId.
    role,
    onboardingStatus,

    // `fullName` is deprecated but remains dual-written during the structured-name migration.
    fullName: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    preferredName: v.optional(v.string()),
    singaporeRegion: v.optional(singaporeRegion),
    serviceIds: v.array(v.id("services")),

    currentGroupId: v.optional(v.id("groups")),
    activeMembershipId: v.optional(v.id("memberships")),
    leaderGroupId: v.optional(v.id("groups")),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_invitedEmail", ["invitedEmail"])
    .index("by_identityEmailNormalized", ["identityEmailNormalized"])
    .index("by_role", ["role"])
    .index("by_current_group", ["currentGroupId"])
    .index("by_active_membership", ["activeMembershipId"])
    .index("by_leader_group", ["leaderGroupId"]),

  services: defineTable({
    name: v.string(),
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active_sort", ["isActive", "sortOrder"])
    .index("by_sort_order", ["sortOrder"]),

  groups: defineTable({
    name: v.string(),
    code: v.string(),
    leaderProfileId: v.optional(v.id("userProfiles")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_leader", ["leaderProfileId"])
    .index("by_active", ["isActive"]),

  coLeaderAssignments: defineTable({
    groupId: v.id("groups"),
    profileId: v.id("userProfiles"),
    status: coLeaderAssignmentStatus,
    assignedAt: v.number(),
    assignedByKind: v.union(v.literal("admin"), v.literal("developer")),
    assignedByUserId: v.optional(v.id("users")),
    revokedAt: v.optional(v.number()),
    revokedByKind: v.optional(v.union(v.literal("admin"), v.literal("developer"))),
    revokedByUserId: v.optional(v.id("users")),
    revocationReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_and_status", ["groupId", "status"])
    .index("by_profile_and_status", ["profileId", "status"])
    .index("by_profile_and_group_and_status", ["profileId", "groupId", "status"])
    .index("by_group_and_profile", ["groupId", "profileId"]),

  joinRequests: defineTable({
    profileId: v.id("userProfiles"),
    groupId: v.id("groups"),
    status: joinRequestStatus,
    requestedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedByProfileId: v.optional(v.id("userProfiles")),
    rejectionReason: v.optional(v.string()),
  })
    .index("by_profile", ["profileId"])
    .index("by_group_status", ["groupId", "status"])
    .index("by_profile_status", ["profileId", "status"])
    .index("by_profile_and_group_and_status", ["profileId", "groupId", "status"])
    .index("by_status", ["status"]),

  memberships: defineTable({
    profileId: v.id("userProfiles"),
    groupId: v.id("groups"),
    status: membershipStatus,
    joinedAt: v.number(),
    // Optional during the widen/backfill phase; reads fall back to joinedAt deterministically.
    sortOrder: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    endedByProfileId: v.optional(v.id("userProfiles")),
    endReason: v.optional(v.string()),
    joinRequestId: v.optional(v.id("joinRequests")),
  })
    .index("by_profile_status", ["profileId", "status"])
    .index("by_profile_and_group_and_status", ["profileId", "groupId", "status"])
    .index("by_group_status", ["groupId", "status"])
    .index("by_group", ["groupId"])
    .index("by_profile_group", ["profileId", "groupId"]),

  membershipActivityPeriods: defineTable({
    membershipId: v.id("memberships"),
    profileId: v.id("userProfiles"),
    groupId: v.id("groups"),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_membership_and_startedAt", ["membershipId", "startedAt"])
    .index("by_membership_and_endedAt", ["membershipId", "endedAt"])
    .index("by_group_and_startedAt", ["groupId", "startedAt"])
    .index("by_profile_and_group_and_startedAt", ["profileId", "groupId", "startedAt"]),

  events: defineTable({
    groupId: v.id("groups"),
    title: v.string(),
    // Deprecated: retained while existing events migrate to `venue`.
    location: v.optional(v.string()),
    venue: v.optional(v.string()),
    word: v.optional(v.string()),
    worship: v.optional(v.string()),
    remarks: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.number(),
    createdByProfileId: v.id("userProfiles"),
    importSource: v.optional(v.union(v.literal("csv"), v.literal("xlsx"))),
    importFileName: v.optional(v.string()),
    importedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    cancelledByProfileId: v.optional(v.id("userProfiles")),
    cancellationReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_start", ["groupId", "startAt"])
    .index("by_group_cancelled_start", ["groupId", "cancelledAt", "startAt"]),

  attendance: defineTable({
    eventId: v.id("events"),
    groupId: v.id("groups"),
    profileId: v.id("userProfiles"),
    membershipId: v.id("memberships"),

    memberSubmittedStatus: v.optional(attendanceStatus),
    memberSubmittedAt: v.optional(v.number()),
    memberSubmittedByProfileId: v.optional(v.id("userProfiles")),

    finalStatus: v.optional(attendanceStatus),
    finalizedAt: v.optional(v.number()),
    finalizedByProfileId: v.optional(v.id("userProfiles")),
    finalizationNote: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_profile", ["eventId", "profileId"])
    .index("by_event", ["eventId"])
    .index("by_profile", ["profileId"])
    .index("by_membership", ["membershipId"])
    .index("by_group", ["groupId"])
    .index("by_group_profile", ["groupId", "profileId"]),

  pushTokens: defineTable({
    profileId: v.id("userProfiles"),
    token: v.string(),
    platform: pushPlatform,
    deviceId: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_profile_active", ["profileId", "isActive"])
    .index("by_token", ["token"]),
});

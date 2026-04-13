import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    role: v.union(v.literal("member"), v.literal("leader"), v.literal("admin")),
    serviceAttending: v.optional(v.string()),
  })
    .index("email", ["email"]),

  groups: defineTable({
    name: v.string(),
    code: v.string(), // short 6-char code e.g. "A3X9KQ"
    createdBy: v.id("users"),
  })
    .index("by_code", ["code"]),

  memberships: defineTable({
    userId: v.id("users"),
    groupId: v.id("groups"),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("left"),
      v.literal("rejected"),
    ),
    requestedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("users")), // leader who approved/rejected
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_group", ["groupId"])
    .index("by_user_and_group", ["userId", "groupId"])
    .index("by_group_and_status", ["groupId", "status"]),
});

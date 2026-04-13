import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";

export const getCurrentMembership = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    // Check for active membership first
    const active = await ctx.db
      .query("memberships")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .first();
    if (active) {
      const group = await ctx.db.get(active.groupId);
      return { ...active, group };
    }

    // Then check for pending
    const pending = await ctx.db
      .query("memberships")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "pending"),
      )
      .first();
    if (pending) {
      const group = await ctx.db.get(pending.groupId);
      return { ...pending, group };
    }

    return null;
  },
});

export const joinGroup = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Look up group by code
    const group = await ctx.db
      .query("groups")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .first();
    if (!group) return { error: "No group found with that code" };

    // Check if user already has an active or pending membership
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .first();
    if (existing) return { error: "You are already in a group" };

    const pending = await ctx.db
      .query("memberships")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "pending"),
      )
      .first();
    if (pending) return { error: "You already have a pending request" };

    // Create pending membership
    await ctx.db.insert("memberships", {
      userId,
      groupId: group._id,
      status: "pending",
      requestedAt: Date.now(),
    });

    return { success: true, groupName: group.name };
  },
});

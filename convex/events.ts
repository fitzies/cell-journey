import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCurrentProfile, requireLeaderProfile } from "./profiles";

export const listMine = query({
  args: { from: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const groupId = profile.role === "leader" ? profile.leaderGroupId : profile.currentGroupId;
    if (!groupId) return [];

    const from = args.from ?? 0;
    const limit = Math.min(args.limit ?? 50, 100);
    const events = [];
    for await (const event of ctx.db
      .query("events")
      .withIndex("by_group_start", (q) => q.eq("groupId", groupId).gte("startAt", from))
      .order("asc")) {
      if (!event.cancelledAt) events.push(event);
      if (events.length >= limit) break;
    }
    return events;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    location: v.string(),
    startAt: v.number(),
    endAt: v.number(),
  },
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    const title = args.title.trim();
    const location = args.location.trim();
    if (!title) throw new Error("Title is required");
    if (!location) throw new Error("Location is required");
    if (args.endAt <= args.startAt) throw new Error("End time must be after start time");
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      groupId: leader.leaderGroupId!,
      title,
      location,
      startAt: args.startAt,
      endAt: args.endAt,
      createdByProfileId: leader._id,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(eventId);
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    title: v.string(),
    location: v.string(),
    startAt: v.number(),
    endAt: v.number(),
  },
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.groupId !== leader.leaderGroupId) throw new Error("Event not found");
    if (event.cancelledAt) throw new Error("Cancelled events cannot be edited");
    const title = args.title.trim();
    const location = args.location.trim();
    if (!title) throw new Error("Title is required");
    if (!location) throw new Error("Location is required");
    if (args.endAt <= args.startAt) throw new Error("End time must be after start time");
    await ctx.db.patch(event._id, {
      title,
      location,
      startAt: args.startAt,
      endAt: args.endAt,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(event._id);
  },
});

export const cancel = mutation({
  args: { eventId: v.id("events"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.groupId !== leader.leaderGroupId) throw new Error("Event not found");
    const now = Date.now();
    await ctx.db.patch(event._id, {
      cancelledAt: now,
      cancelledByProfileId: leader._id,
      cancellationReason: args.reason,
      updatedAt: now,
    });
    return null;
  },
});

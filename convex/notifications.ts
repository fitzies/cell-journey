import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, mutation } from "./_generated/server";
import { completionForEvents } from "./attendance";
import { requireCurrentProfile } from "./profiles";

const HOUR = 60 * 60 * 1000;
export const ATTENDANCE_REMINDER_DELAY = 3 * HOUR;
// Events that ended longer ago than this are skipped, so the first run after
// deploy (or a long outage) never sends reminders for old events.
const ATTENDANCE_REMINDER_LOOKBACK = 24 * HOUR;
const EVENTS_PER_RUN = 50;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const pushPlatform = v.union(v.literal("ios"), v.literal("android"), v.literal("web"));

/** Saves this device's Expo push token for the signed-in person. */
export const registerPushToken = mutation({
  args: { token: v.string(), platform: pushPlatform, deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const token = args.token.trim();
    if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) throw new Error("Invalid push token");
    const now = Date.now();
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        profileId: profile._id,
        platform: args.platform,
        deviceId: args.deviceId,
        isActive: true,
        updatedAt: now,
        lastSeenAt: now,
      });
      return null;
    }
    await ctx.db.insert("pushTokens", {
      profileId: profile._id,
      token,
      platform: args.platform,
      deviceId: args.deviceId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    return null;
  },
});

/** Stops pushes to this device, for example on sign-out. */
export const unregisterPushToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .first();
    if (existing && existing.profileId === profile._id && existing.isActive) {
      await ctx.db.patch(existing._id, { isActive: false, updatedAt: Date.now() });
    }
    return null;
  },
});

const pushMessage = v.object({
  to: v.string(),
  title: v.string(),
  body: v.string(),
  data: v.object({
    type: v.literal("attendanceReminder"),
    eventId: v.id("events"),
    groupId: v.id("groups"),
  }),
});

/**
 * Runs every few minutes. For events that ended at least 3 hours ago, sends
 * the group's owner and co-leaders a reminder when anyone is still unmarked.
 */
export const checkAttendanceReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const events = await ctx.db
      .query("events")
      .withIndex("by_attendanceReminderCheckedAt_and_endAt", (q) =>
        q
          .eq("attendanceReminderCheckedAt", undefined)
          .gte("endAt", now - ATTENDANCE_REMINDER_DELAY - ATTENDANCE_REMINDER_LOOKBACK)
          .lte("endAt", now - ATTENDANCE_REMINDER_DELAY),
      )
      .take(EVENTS_PER_RUN);

    const messages = [];
    for (const event of events) {
      await ctx.db.patch(event._id, { attendanceReminderCheckedAt: now });
      if (event.cancelledAt) continue;
      const group = await ctx.db.get(event.groupId);
      if (!group?.isActive) continue;

      const { complete, requiredTotal, marked } = await completionForEvents(ctx, group._id, [event]);
      if (complete.get(event._id) !== false) continue;
      const unmarked = (requiredTotal.get(event._id) ?? 0) - (marked.get(event._id) ?? 0);
      if (unmarked <= 0) continue;

      const leaderIds = new Set<Id<"userProfiles">>();
      if (group.leaderProfileId) leaderIds.add(group.leaderProfileId);
      const coLeaders = await ctx.db
        .query("coLeaderAssignments")
        .withIndex("by_group_and_status", (q) => q.eq("groupId", group._id).eq("status", "active"))
        .take(50);
      for (const assignment of coLeaders) leaderIds.add(assignment.profileId);

      for (const profileId of leaderIds) {
        const tokens = await ctx.db
          .query("pushTokens")
          .withIndex("by_profile_active", (q) => q.eq("profileId", profileId).eq("isActive", true))
          .take(10);
        for (const token of tokens) {
          if (token.platform === "web") continue;
          messages.push({
            to: token.token,
            title: `Mark attendance for ${event.title}`,
            body: `${unmarked} ${unmarked === 1 ? "person is" : "people are"} still unmarked in ${group.name}.`,
            data: { type: "attendanceReminder" as const, eventId: event._id, groupId: group._id },
          });
        }
      }
    }

    if (messages.length > 0) {
      await ctx.scheduler.runAfter(0, internal.notifications.sendPushMessages, { messages });
    }
    return { checked: events.length, sent: messages.length };
  },
});

export const sendPushMessages = internalAction({
  args: { messages: v.array(pushMessage) },
  handler: async (ctx, args) => {
    const invalidTokens: string[] = [];
    for (let index = 0; index < args.messages.length; index += 100) {
      const chunk = args.messages.slice(index, index + 100);
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map((message) => ({ ...message, sound: "default" }))),
      });
      if (!response.ok) {
        console.error("Expo push request failed", response.status, await response.text());
        continue;
      }
      const result = (await response.json()) as {
        data?: Array<{ status: string; details?: { error?: string } }>;
      };
      result.data?.forEach((ticket, ticketIndex) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(chunk[ticketIndex].to);
        }
      });
    }
    if (invalidTokens.length > 0) {
      await ctx.runMutation(internal.notifications.deactivateTokens, { tokens: invalidTokens });
    }
    return null;
  },
});

export const deactivateTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const token of args.tokens) {
      const row = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
      if (row?.isActive) await ctx.db.patch(row._id, { isActive: false, updatedAt: Date.now() });
    }
    return null;
  },
});

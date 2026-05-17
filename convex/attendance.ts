import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCurrentProfile, requireLeaderProfile } from "./profiles";

const attendanceStatus = v.union(v.literal("present"), v.literal("absent"));
const ONE_HOUR = 60 * 60 * 1000;

type Membership = Doc<"memberships">;

async function findMembershipForEvent(
  ctx: QueryCtx | MutationCtx,
  profileId: Id<"userProfiles">,
  event: Doc<"events">,
): Promise<Membership | null> {
  for await (const membership of ctx.db
    .query("memberships")
    .withIndex("by_profile_group", (q) => q.eq("profileId", profileId).eq("groupId", event.groupId))) {
    const startsBeforeEvent = membership.joinedAt <= event.startAt;
    const endsAfterEvent = !membership.endedAt || membership.endedAt >= event.startAt;
    if (startsBeforeEvent && endsAfterEvent) return membership;
  }
  return null;
}

function effectiveStatus(attendance: Doc<"attendance"> | null) {
  return attendance?.finalStatus ?? attendance?.memberSubmittedStatus ?? null;
}

export const selfSubmit = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    if (profile.role !== "member") throw new Error("Only members can self-submit attendance");
    if (!profile.currentGroupId || !profile.activeMembershipId) throw new Error("Not in a group");

    const event = await ctx.db.get(args.eventId);
    if (!event || event.groupId !== profile.currentGroupId || event.cancelledAt) {
      throw new Error("Event not found");
    }

    const now = Date.now();
    if (now < event.startAt - ONE_HOUR || now > event.endAt + ONE_HOUR) {
      throw new Error("Attendance is not open for this event");
    }

    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_profile", (q) => q.eq("eventId", event._id).eq("profileId", profile._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        memberSubmittedStatus: "present",
        memberSubmittedAt: now,
        memberSubmittedByProfileId: profile._id,
        updatedAt: now,
      });
      return await ctx.db.get(existing._id);
    }

    const attendanceId = await ctx.db.insert("attendance", {
      eventId: event._id,
      groupId: event.groupId,
      profileId: profile._id,
      membershipId: profile.activeMembershipId,
      memberSubmittedStatus: "present",
      memberSubmittedAt: now,
      memberSubmittedByProfileId: profile._id,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(attendanceId);
  },
});

export const markForMember = mutation({
  args: {
    eventId: v.id("events"),
    profileId: v.id("userProfiles"),
    status: attendanceStatus,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.groupId !== leader.leaderGroupId) throw new Error("Event not found");

    const member = await ctx.db.get(args.profileId);
    if (!member) throw new Error("Member not found");

    const membership = await findMembershipForEvent(ctx, member._id, event);
    if (!membership) throw new Error("Member was not active in this group for this event");

    const now = Date.now();
    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_profile", (q) => q.eq("eventId", event._id).eq("profileId", member._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        finalStatus: args.status,
        finalizedAt: now,
        finalizedByProfileId: leader._id,
        finalizationNote: args.note,
        updatedAt: now,
      });
      return await ctx.db.get(existing._id);
    }

    const attendanceId = await ctx.db.insert("attendance", {
      eventId: event._id,
      groupId: event.groupId,
      profileId: member._id,
      membershipId: membership._id,
      finalStatus: args.status,
      finalizedAt: now,
      finalizedByProfileId: leader._id,
      finalizationNote: args.note,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(attendanceId);
  },
});

export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const canView =
      (profile.role === "leader" && profile.leaderGroupId === event.groupId) ||
      (profile.role === "member" && profile.currentGroupId === event.groupId);
    if (!canView) throw new Error("Unauthorized");

    return await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .take(300);
  },
});

export const myHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const now = Date.now();
    const limit = Math.min(args.limit ?? 50, 100);

    const memberships: Membership[] = [];
    for (const status of ["active", "left", "removed"] as const) {
      for await (const membership of ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) => q.eq("profileId", profile._id).eq("status", status))) {
        memberships.push(membership);
      }
    }

    const rows = [];
    let totalPastEvents = 0;
    let presentEvents = 0;

    for (const membership of memberships) {
      for await (const event of ctx.db
        .query("events")
        .withIndex("by_group_start", (q) => q.eq("groupId", membership.groupId).gte("startAt", membership.joinedAt))
        .order("asc")) {
        if (event.startAt > now) break;
        if (membership.endedAt && event.startAt > membership.endedAt) break;
        if (event.cancelledAt) continue;

        const attendance = await ctx.db
          .query("attendance")
          .withIndex("by_event_profile", (q) => q.eq("eventId", event._id).eq("profileId", profile._id))
          .unique();
        const status = effectiveStatus(attendance);

        totalPastEvents += 1;
        if (status === "present") presentEvents += 1;
        rows.push({ event, attendance, status: status ?? "absent" });
      }
    }

    rows.sort((a, b) => b.event.startAt - a.event.startAt);
    return {
      attendanceRate: totalPastEvents === 0 ? null : presentEvents / totalPastEvents,
      presentEvents,
      totalPastEvents,
      rows: rows.slice(0, limit),
    };
  },
});

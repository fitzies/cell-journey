import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getActiveMembershipForGroup,
  requireCurrentProfile,
  requireLeadershipForGroup,
} from "./profiles";

const attendanceStatus = v.union(v.literal("present"), v.literal("absent"));
const ONE_HOUR = 60 * 60 * 1000;

type Membership = Doc<"memberships">;

async function findMembershipForEvent(
  ctx: QueryCtx | MutationCtx,
  profileId: Id<"userProfiles">,
  event: Doc<"events">,
): Promise<Membership | null> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_profile_group", (q) =>
      q.eq("profileId", profileId).eq("groupId", event.groupId),
    )
    .take(100);

  const eligible = memberships
    .filter(
      (membership) =>
        membership.joinedAt <= event.startAt &&
        (!membership.endedAt || membership.endedAt >= event.startAt),
    )
    .sort((a, b) => b.joinedAt - a.joinedAt);
  return eligible[0] ?? null;
}

function effectiveStatus(attendance: Doc<"attendance"> | null) {
  return attendance?.finalStatus ?? attendance?.memberSubmittedStatus ?? null;
}

export const selfSubmit = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.cancelledAt) throw new Error("Event not found");

    const membership = await findMembershipForEvent(ctx, profile._id, event);
    if (!membership) throw new Error("You were not a member of this group for this event");

    const now = Date.now();
    if (now < event.startAt - ONE_HOUR || now > event.endAt + ONE_HOUR) {
      throw new Error("Attendance is not open for this event");
    }

    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_profile", (q) =>
        q.eq("eventId", event._id).eq("profileId", profile._id),
      )
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
      membershipId: membership._id,
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
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const { profile: leader } = await requireLeadershipForGroup(ctx, event.groupId);

    const member = await ctx.db.get(args.profileId);
    if (!member) throw new Error("Member not found");
    const membership = await findMembershipForEvent(ctx, member._id, event);
    if (!membership) throw new Error("Member was not active in this group for this event");

    const now = Date.now();
    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_profile", (q) =>
        q.eq("eventId", event._id).eq("profileId", member._id),
      )
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

    const group = await ctx.db.get(event.groupId);
    if (!group) throw new Error("Event not found");
    if (group.leaderProfileId === profile._id) {
      return await ctx.db
        .query("attendance")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .take(300);
    }

    const membership = await getActiveMembershipForGroup(ctx, profile._id, event.groupId);
    if (!membership) throw new Error("Unauthorized");
    const own = await ctx.db
      .query("attendance")
      .withIndex("by_event_profile", (q) =>
        q.eq("eventId", event._id).eq("profileId", profile._id),
      )
      .unique();
    return own ? [own] : [];
  },
});

async function getHistoryForGroup(
  ctx: QueryCtx,
  profileId: Id<"userProfiles">,
  groupId: Id<"groups">,
  limit: number,
) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_profile_group", (q) =>
      q.eq("profileId", profileId).eq("groupId", groupId),
    )
    .take(100);
  if (memberships.length === 0) throw new Error("No membership history for this group");

  const firstJoinedAt = Math.min(...memberships.map((membership) => membership.joinedAt));
  const now = Date.now();
  const rows = [];
  let totalPastEvents = 0;
  let presentEvents = 0;

  for await (const event of ctx.db
    .query("events")
    .withIndex("by_group_start", (q) =>
      q.eq("groupId", groupId).gte("startAt", firstJoinedAt),
    )
    .order("asc")) {
    if (event.startAt > now) break;
    if (event.endAt > now || event.cancelledAt) continue;
    const eligible = memberships.some(
      (membership) =>
        membership.joinedAt <= event.startAt &&
        (!membership.endedAt || membership.endedAt >= event.startAt),
    );
    if (!eligible) continue;

    const attendance = await ctx.db
      .query("attendance")
      .withIndex("by_event_profile", (q) =>
        q.eq("eventId", event._id).eq("profileId", profileId),
      )
      .unique();
    const status = effectiveStatus(attendance);
    totalPastEvents += 1;
    if (status === "present") presentEvents += 1;
    rows.push({ event, attendance, status: status ?? "absent" });
  }

  rows.sort((a, b) => b.event.startAt - a.event.startAt);
  return {
    attendanceRate: totalPastEvents === 0 ? null : presentEvents / totalPastEvents,
    presentEvents,
    totalPastEvents,
    rows: rows.slice(0, limit),
  };
}

export const historyForGroup = query({
  args: { groupId: v.id("groups"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    return await getHistoryForGroup(
      ctx,
      profile._id,
      args.groupId,
      Math.min(args.limit ?? 50, 100),
    );
  },
});

/** Legacy history for the first active membership. */
export const myHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .first();
    if (!membership) {
      return {
        attendanceRate: null,
        presentEvents: 0,
        totalPastEvents: 0,
        rows: [],
      };
    }
    return await getHistoryForGroup(
      ctx,
      profile._id,
      membership.groupId,
      Math.min(args.limit ?? 50, 100),
    );
  },
});

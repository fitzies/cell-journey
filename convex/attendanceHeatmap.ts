import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireGroupCapability } from "./profiles";
import { isMembershipActiveAtFromRows, loadGroupMembershipActivity } from "./membershipActivity";

const DAY = 86_400_000;
const SINGAPORE_OFFSET = 8 * 60 * 60 * 1000;

type EventSummary = {
  eventId: Id<"events">;
  title: string;
  startAt: number;
  endAt: number;
  required: number;
  present: number;
  marked: number;
  optionalPresent: number;
  complete: boolean;
};

/** A bounded, profile-free summary. Day boundaries always follow Singapore time. */
export const forGroup = query({
  args: { groupId: v.id("groups"), now: v.number() },
  handler: async (ctx, args) => {
    await requireGroupCapability(ctx, args.groupId, "readAttendance");
    if (!Number.isFinite(args.now) || args.now < 0) throw new ConvexError("Invalid date");
    const now = Math.min(args.now, Date.now());
    const today = Math.floor((now + SINGAPORE_OFFSET) / DAY) * DAY - SINGAPORE_OFFSET;
    const from = today - 89 * DAY;
    const days = Array.from({ length: 90 }, (_, i) => ({
      startAt: from + i * DAY,
      date: new Date(from + i * DAY + SINGAPORE_OFFSET).toISOString().slice(0, 10),
      events: [] as EventSummary[],
      required: 0, present: 0, marked: 0, rate: null as number | null,
    }));
    const events = await ctx.db.query("events")
      .withIndex("by_group_start", q => q.eq("groupId", args.groupId).gte("startAt", from).lte("startAt", now))
      .take(181);
    if (events.length > 180) throw new ConvexError("Too many events to summarize this period");
    const activity = await loadGroupMembershipActivity(ctx, args.groupId);
    let attendanceReads = 0;
    let present = 0;
    let required = 0;
    let completedEvents = 0;
    let pendingEvents = 0;
    for (const event of events) {
      if (event.cancelledAt) continue;
      const eligible = new Set(activity.memberships.filter(membership =>
        isMembershipActiveAtFromRows(membership, activity.periodsByMembership.get(membership._id) ?? [], event.startAt),
      ).map(membership => membership.profileId));
      const records = await ctx.db.query("attendance").withIndex("by_event", q => q.eq("eventId", event._id)).take(601);
      attendanceReads += records.length;
      if (records.length > 600 || attendanceReads > 12_000) throw new ConvexError("Attendance history is too large to summarize");
      const byProfile = new Map(records.map(record => [record.profileId, record]));
      const summary: EventSummary = {
        eventId: event._id, title: event.title, startAt: event.startAt, endAt: event.endAt,
        required: eligible.size, present: 0, marked: 0, optionalPresent: 0, complete: false,
      };
      for (const profileId of eligible) {
        const record = byProfile.get(profileId);
        const status = record?.finalStatus ?? record?.memberSubmittedStatus;
        if (status) summary.marked++;
        if (status === "present") summary.present++;
      }
      for (const record of byProfile.values()) {
        if (!eligible.has(record.profileId) && (record.finalStatus ?? record.memberSubmittedStatus) === "present") summary.optionalPresent++;
      }
      summary.complete = summary.marked === summary.required && event.endAt <= now;
      const day = days[Math.floor((event.startAt - from) / DAY)];
      day.events.push(summary);
      day.required += summary.required;
      day.present += summary.present;
      day.marked += summary.marked;
      if (summary.complete && summary.required > 0) {
        completedEvents++;
        present += summary.present;
        required += summary.required;
      } else if (!summary.complete) pendingEvents++;
    }
    for (const day of days) {
      if (day.required > 0 && day.events.every(event => event.complete)) day.rate = day.present / day.required;
    }
    return { days, rate: required > 0 ? present / required : null, completedEvents, pendingEvents };
  },
});

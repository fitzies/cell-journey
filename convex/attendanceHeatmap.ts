import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireGroupCapability } from "./profiles";
import { isMembershipActiveAtFromRows, loadGroupMembershipActivity } from "./membershipActivity";

const DAY = 86_400_000;
const SINGAPORE_OFFSET = 8 * 60 * 60 * 1000;
const MAX_ATTENDANCE_PER_EVENT = 600;
const MAX_ATTENDANCE_READS = 12_000;
const MAX_YEAR_EVENTS = 366;
const RECENT_EVENT_COUNT = 4;

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

function parseNow(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new ConvexError("Invalid date");
  return Math.min(value, Date.now());
}

/**
 * Per-event attendance against the members eligible at each event's start.
 * Cancelled events are skipped. `complete` means every eligible member is
 * marked and the event has ended; only complete events carry a rate.
 */
async function summarizeEvents(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  events: Doc<"events">[],
  now: number,
): Promise<EventSummary[]> {
  const activity = await loadGroupMembershipActivity(ctx, groupId);
  const summaries: EventSummary[] = [];
  let attendanceReads = 0;
  for (const event of events) {
    if (event.cancelledAt) continue;
    const eligible = new Set(activity.memberships.filter(membership =>
      isMembershipActiveAtFromRows(membership, activity.periodsByMembership.get(membership._id) ?? [], event.startAt),
    ).map(membership => membership.profileId));
    const records = await ctx.db.query("attendance").withIndex("by_event", q => q.eq("eventId", event._id)).take(MAX_ATTENDANCE_PER_EVENT + 1);
    attendanceReads += records.length;
    if (records.length > MAX_ATTENDANCE_PER_EVENT || attendanceReads > MAX_ATTENDANCE_READS) {
      throw new ConvexError("Attendance history is too large to summarize");
    }
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
    summaries.push(summary);
  }
  return summaries;
}

const hasRate = (event: EventSummary) => event.complete && event.required > 0;

function weightedRate(events: EventSummary[]) {
  let present = 0;
  let required = 0;
  for (const event of events) {
    if (!hasRate(event)) continue;
    present += event.present;
    required += event.required;
  }
  return required > 0 ? present / required : null;
}

/** A bounded, profile-free summary. Day boundaries always follow Singapore time. */
export const forGroup = query({
  args: { groupId: v.id("groups"), now: v.number() },
  handler: async (ctx, args) => {
    await requireGroupCapability(ctx, args.groupId, "readAttendance");
    const now = parseNow(args.now);
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
    let completedEvents = 0;
    let pendingEvents = 0;
    for (const summary of await summarizeEvents(ctx, args.groupId, events, now)) {
      const day = days[Math.floor((summary.startAt - from) / DAY)];
      day.events.push(summary);
      day.required += summary.required;
      day.present += summary.present;
      day.marked += summary.marked;
      if (hasRate(summary)) completedEvents++;
      else if (!summary.complete) pendingEvents++;
    }
    for (const day of days) {
      if (day.required > 0 && day.events.every(event => event.complete)) day.rate = day.present / day.required;
    }
    return { days, rate: weightedRate(days.flatMap(day => day.events)), completedEvents, pendingEvents };
  },
});

/**
 * One entry per non-cancelled event that has started in the current calendar
 * year (Singapore time), oldest first, plus the stat-card summary. Rates use
 * the same eligibility rules as `forGroup` and only exist for complete events.
 */
export const forYear = query({
  args: { groupId: v.id("groups"), now: v.number() },
  handler: async (ctx, args) => {
    await requireGroupCapability(ctx, args.groupId, "readAttendance");
    const now = parseNow(args.now);
    const year = new Date(now + SINGAPORE_OFFSET).getUTCFullYear();
    const from = Date.UTC(year, 0, 1) - SINGAPORE_OFFSET;
    const to = Date.UTC(year + 1, 0, 1) - SINGAPORE_OFFSET;
    const rows = await ctx.db.query("events")
      .withIndex("by_group_start", q => q.eq("groupId", args.groupId).gte("startAt", from).lte("startAt", now))
      .take(MAX_YEAR_EVENTS + 1);
    if (rows.length > MAX_YEAR_EVENTS) throw new ConvexError("Too many events to summarize this year");
    const summaries = await summarizeEvents(ctx, args.groupId, rows, now);
    const events = summaries.map(event => ({
      eventId: event.eventId,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      required: event.required,
      present: event.present,
      marked: event.marked,
      complete: event.complete,
      rate: hasRate(event) ? event.present / event.required : null,
    }));
    const rated = summaries.filter(hasRate);
    const recent = rated.slice(-RECENT_EVENT_COUNT);
    const last = rated.at(-1);
    return {
      year,
      from,
      to,
      events,
      summary: {
        rate: weightedRate(rated),
        completedEvents: rated.length,
        recentRate: weightedRate(recent),
        recentEvents: recent.length,
        // Started events where some eligible member still has no attendance.
        toMark: summaries.filter(event => event.marked < event.required).length,
        lastGathering: last
          ? { eventId: last.eventId, title: last.title, startAt: last.startAt, present: last.present, required: last.required }
          : null,
      },
    };
  },
});

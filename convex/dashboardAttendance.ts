import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { isMembershipActiveAtFromRows } from "./membershipActivity";

const EVENT_LIMIT = 160;
const MEMBERSHIP_LIMIT = 1000;
const PERIOD_LIMIT = 3001;
const ATTENDANCE_LIMIT = 1500;
const MAX_WINDOW = 366 * 24 * 60 * 60 * 1000;

export type AttendanceWindow = { from: number; to: number; previousFrom: number };

/** Clamps a requested range to at most a year that ends no later than now. */
export function attendanceWindow(args: { from: number; to: number }): AttendanceWindow {
  const to = Math.min(args.to, Date.now());
  const window = Math.min(Math.max(to - args.from, 1), MAX_WINDOW);
  const from = to - window;
  return { from, to, previousFrom: from - window };
}

export function effectiveAttendanceStatus(attendance: Doc<"attendance"> | undefined) {
  return attendance?.finalStatus ?? attendance?.memberSubmittedStatus ?? null;
}

/**
 * Loads one group's completed events, memberships and attendance for the
 * current window and the window before it, within fixed safety limits.
 */
export async function loadGroupAttendanceWindow(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  window: AttendanceWindow,
) {
  const events = await ctx.db
    .query("events")
    .withIndex("by_group_start", (q) =>
      q.eq("groupId", groupId).gte("startAt", window.previousFrom).lte("startAt", window.to),
    )
    .order("desc")
    .take(EVENT_LIMIT);
  const completedEvents = events.filter((event) => !event.cancelledAt && event.endAt <= window.to);
  const currentEvents = completedEvents.filter((event) => event.startAt >= window.from);
  const previousEvents = completedEvents.filter((event) => event.startAt < window.from);

  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .take(MEMBERSHIP_LIMIT);
  const activityPeriods = await ctx.db
    .query("membershipActivityPeriods")
    .withIndex("by_group_and_startedAt", (q) => q.eq("groupId", groupId).lte("startedAt", window.to))
    .take(PERIOD_LIMIT);
  const periodsByMembership = new Map<Id<"memberships">, Doc<"membershipActivityPeriods">[]>();
  for (const period of activityPeriods) {
    const rows = periodsByMembership.get(period.membershipId) ?? [];
    rows.push(period);
    periodsByMembership.set(period.membershipId, rows);
  }

  const attendanceRows = completedEvents.length === 0
    ? []
    : await ctx.db
        .query("attendance")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .order("desc")
        .take(ATTENDANCE_LIMIT);
  const relevantEventIds = new Set(completedEvents.map((event) => event._id));
  const attendanceByEventAndProfile = new Map<string, Doc<"attendance">>();
  for (const attendance of attendanceRows) {
    if (relevantEventIds.has(attendance.eventId)) {
      attendanceByEventAndProfile.set(`${attendance.eventId}:${attendance.profileId}`, attendance);
    }
  }

  return {
    currentEvents,
    previousEvents,
    memberships,
    periodsByMembership,
    attendanceByEventAndProfile,
    isComplete:
      events.length < EVENT_LIMIT &&
      memberships.length < MEMBERSHIP_LIMIT &&
      activityPeriods.length < PERIOD_LIMIT &&
      attendanceRows.length < ATTENDANCE_LIMIT,
  };
}

export type GroupAttendanceWindow = Awaited<ReturnType<typeof loadGroupAttendanceWindow>>;

/** Profiles expected at an event: everyone whose membership was active when it started. */
export function eligibleProfilesForEvent(data: GroupAttendanceWindow, event: Doc<"events">) {
  return new Set(
    data.memberships
      .filter((membership) =>
        isMembershipActiveAtFromRows(
          membership,
          data.periodsByMembership.get(membership._id) ?? [],
          event.startAt,
        ),
      )
      .map((membership) => membership.profileId),
  );
}

export function attendanceTotals(data: GroupAttendanceWindow, events: Doc<"events">[]) {
  let present = 0;
  let expected = 0;
  for (const event of events) {
    const eligibleProfiles = eligibleProfilesForEvent(data, event);
    expected += eligibleProfiles.size;
    for (const profileId of eligibleProfiles) {
      const attendance = data.attendanceByEventAndProfile.get(`${event._id}:${profileId}`);
      if (effectiveAttendanceStatus(attendance) === "present") present += 1;
    }
  }
  return {
    present,
    expected,
    absent: Math.max(expected - present, 0),
    rate: expected === 0 ? null : present / expected,
  };
}

export type MemberEventStatus = "present" | "absent" | "unmarked" | "notMember";

/** Per-profile attendance across the current window, with one status per event. */
export function memberAttendanceStats(data: GroupAttendanceWindow) {
  const events = [...data.currentEvents].sort((a, b) => a.startAt - b.startAt);
  const byProfile = new Map<
    Id<"userProfiles">,
    {
      present: number;
      absent: number;
      unmarked: number;
      expected: number;
      lastPresentAt: number | null;
      statuses: MemberEventStatus[];
    }
  >();
  const connectedProfiles = new Set(
    data.memberships
      .filter((membership) => membership.status === "active" || membership.status === "inactive")
      .map((membership) => membership.profileId),
  );
  const eligibleByEvent = events.map((event) => eligibleProfilesForEvent(data, event));
  const profiles = new Set<Id<"userProfiles">>(connectedProfiles);
  for (const eligible of eligibleByEvent) for (const profileId of eligible) profiles.add(profileId);

  for (const profileId of profiles) {
    const stats = {
      present: 0,
      absent: 0,
      unmarked: 0,
      expected: 0,
      lastPresentAt: null as number | null,
      statuses: [] as MemberEventStatus[],
    };
    events.forEach((event, index) => {
      if (!eligibleByEvent[index].has(profileId)) {
        stats.statuses.push("notMember");
        return;
      }
      stats.expected += 1;
      const status = effectiveAttendanceStatus(
        data.attendanceByEventAndProfile.get(`${event._id}:${profileId}`),
      );
      if (status === "present") {
        stats.present += 1;
        stats.lastPresentAt = event.startAt;
        stats.statuses.push("present");
      } else if (status === "absent") {
        stats.absent += 1;
        stats.statuses.push("absent");
      } else {
        stats.unmarked += 1;
        stats.statuses.push("unmarked");
      }
    });
    byProfile.set(profileId, stats);
  }
  return { events, byProfile };
}

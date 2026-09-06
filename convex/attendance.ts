import { withProfilePhoto } from "./lib/profilePhoto";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getActiveMembershipForGroup,
  getConnectedMembershipForGroup,
  getLeadershipAccessForGroup,
  getProfileDisplayName,
  requireCurrentProfile,
  requireGroupCapability,
} from "./profiles";
import {
  isMembershipActiveAt,
  isMembershipActiveAtFromRows,
  loadGroupMembershipActivity,
} from "./membershipActivity";
import { compareMemberships } from "./membershipOrdering";

const attendanceStatus = v.union(v.literal("present"), v.literal("absent"));
const ONE_HOUR = 60 * 60 * 1000;
const MAX_WORKLIST_PAGE_SIZE = 20;
const MAX_RECENT_COMPLETED_EVENTS = 20;
const MAX_RECENT_COMPLETED_SCAN_EVENTS = 25;

type DbCtx = QueryCtx | MutationCtx;
type Membership = Doc<"memberships">;

type GroupActivity = Awaited<ReturnType<typeof loadGroupMembershipActivity>>;

async function findMembershipForEvent(
  ctx: DbCtx,
  profileId: Id<"userProfiles">,
  event: Doc<"events">,
): Promise<Membership | null> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_profile_group", (q) =>
      q.eq("profileId", profileId).eq("groupId", event.groupId),
    )
    .take(100);

  const eligible: Membership[] = [];
  for (const membership of memberships) {
    if (await isMembershipActiveAt(ctx, membership, event.startAt)) {
      eligible.push(membership);
    }
  }
  eligible.sort((a, b) => b.joinedAt - a.joinedAt);
  return eligible[0] ?? null;
}

function isOptionalInactiveMembershipForEvent(
  membership: Membership | null | undefined,
  event: Doc<"events">,
) {
  return Boolean(
    membership &&
      membership.groupId === event.groupId &&
      membership.status === "inactive" &&
      membership.joinedAt <= event.startAt,
  );
}

function effectiveStatus(attendance: Doc<"attendance"> | null | undefined) {
  return attendance?.finalStatus ?? attendance?.memberSubmittedStatus ?? null;
}

async function attendanceForEvent(ctx: DbCtx, eventId: Id<"events">) {
  return await ctx.db
    .query("attendance")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(600);
}

async function rosterForEvent(
  ctx: QueryCtx,
  event: Doc<"events">,
  activity: GroupActivity,
  profileCache?: Map<Id<"userProfiles">, Doc<"userProfiles">>,
) {
  const attendanceRows = await attendanceForEvent(ctx, event._id);
  const attendanceByProfile = new Map(
    attendanceRows.map((row) => [row.profileId, row]),
  );

  const requiredMemberships = activity.memberships
    .filter((membership) =>
      isMembershipActiveAtFromRows(
        membership,
        activity.periodsByMembership.get(membership._id) ?? [],
        event.startAt,
      ),
    )
    .sort(compareMemberships);

  // Defensive de-duplication for malformed pre-migration data. New mutations
  // prevent overlapping current relationships and periods.
  const requiredByProfile = new Map<Id<"userProfiles">, Membership>();
  for (const membership of requiredMemberships) {
    const existing = requiredByProfile.get(membership.profileId);
    if (!existing || membership.joinedAt > existing.joinedAt) {
      requiredByProfile.set(membership.profileId, membership);
    }
  }

  const optionalMemberships = activity.memberships
    .filter(
      (membership) =>
        isOptionalInactiveMembershipForEvent(membership, event) &&
        !requiredByProfile.has(membership.profileId),
    )
    .sort(compareMemberships);

  const rows = [];
  for (const [eligibility, memberships] of [
    ["required", [...requiredByProfile.values()].sort(compareMemberships)],
    ["optional", optionalMemberships],
  ] as const) {
    for (const membership of memberships) {
      const profile = profileCache
        ? profileCache.get(membership.profileId) ?? null
        : await ctx.db.get(membership.profileId);
      if (!profile) continue;
      const attendance = attendanceByProfile.get(profile._id) ?? null;
      rows.push({
        eligibility,
        membership,
        profile: (await withProfilePhoto(ctx, profile))!,
        displayName: getProfileDisplayName(profile),
        attendance,
        effectiveStatus: effectiveStatus(attendance),
      });
    }
  }

  const requiredRows = rows.filter((row) => row.eligibility === "required");
  const markedRequiredCount = requiredRows.filter(
    (row) => row.effectiveStatus !== null,
  ).length;
  return {
    rows,
    requiredCount: requiredRows.length,
    markedRequiredCount,
    isComplete: markedRequiredCount === requiredRows.length,
  };
}

export const selfSubmit = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.cancelledAt) throw new Error("Event not found");

    const currentMembership = await getActiveMembershipForGroup(
      ctx,
      profile._id,
      event.groupId,
    );
    if (!currentMembership) throw new Error("Inactive members cannot self-check in");
    const membership = await findMembershipForEvent(ctx, profile._id, event);
    if (!membership || membership._id !== currentMembership._id) {
      throw new Error("You were not active in this group for this event");
    }

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
    if (!event || event.cancelledAt) throw new Error("Event not found");
    const { profile: leader } = await requireGroupCapability(
      ctx,
      event.groupId,
      "markAttendance",
    );
    const now = Date.now();
    if (event.startAt > now) {
      throw new Error("Attendance cannot be changed for a future event");
    }

    const member = await ctx.db.get(args.profileId);
    if (!member) throw new Error("Member not found");
    const requiredMembership = await findMembershipForEvent(ctx, member._id, event);
    const connectedMembership = await getConnectedMembershipForGroup(
      ctx,
      member._id,
      event.groupId,
    );
    const optionalMembership =
      !requiredMembership &&
      isOptionalInactiveMembershipForEvent(connectedMembership, event)
        ? connectedMembership
        : null;
    const membership = requiredMembership ?? optionalMembership;
    if (!membership) throw new Error("Member is not eligible for this event");
    if (optionalMembership && args.status === "absent") {
      throw new Error("Inactive optional members can only be marked present");
    }

    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_profile", (q) =>
        q.eq("eventId", event._id).eq("profileId", member._id),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        membershipId: membership._id,
        finalStatus: args.status,
        finalizedAt: now,
        finalizedByProfileId: leader._id,
        finalizationNote: args.note?.trim() || undefined,
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
      finalizationNote: args.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(attendanceId);
  },
});

export const clearOptionalForMember = mutation({
  args: { eventId: v.id("events"), profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.cancelledAt) throw new Error("Event not found");
    await requireGroupCapability(ctx, event.groupId, "markAttendance");
    const now = Date.now();
    if (event.startAt > now) {
      throw new Error("Attendance cannot be changed for a future event");
    }

    const requiredMembership = await findMembershipForEvent(ctx, args.profileId, event);
    const connectedMembership = await getConnectedMembershipForGroup(
      ctx,
      args.profileId,
      event.groupId,
    );
    if (
      requiredMembership ||
      !isOptionalInactiveMembershipForEvent(connectedMembership, event)
    ) {
      throw new Error("Only optional inactive attendance can be cleared");
    }

    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_event_profile", (q) =>
        q.eq("eventId", event._id).eq("profileId", args.profileId),
      )
      .unique();
    if (!existing) return null;
    if (existing.memberSubmittedStatus === undefined) {
      await ctx.db.delete(existing._id);
      return null;
    }
    await ctx.db.patch(existing._id, {
      finalStatus: undefined,
      finalizedAt: undefined,
      finalizedByProfileId: undefined,
      finalizationNote: undefined,
      updatedAt: now,
    });
    return await ctx.db.get(existing._id);
  },
});

export const attendanceWorklist = query({
  args: {
    groupId: v.id("groups"),
    // Clients should keep this bucket stable while following continueCursor.
    now: v.number(),
    // `limit` is retained as a compatibility alias for first-page callers.
    limit: v.optional(v.number()),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    await requireGroupCapability(ctx, args.groupId, "readAttendance");
    const requestedPageSize = args.paginationOpts?.numItems ?? args.limit ?? 20;
    const numItems = Math.min(
      Math.max(Math.floor(requestedPageSize), 1),
      MAX_WORKLIST_PAGE_SIZE,
    );
    const eventPage = await ctx.db
      .query("events")
      .withIndex("by_group_start", (q) =>
        q.eq("groupId", args.groupId).lte("startAt", args.now),
      )
      .order("desc")
      .paginate({
        numItems,
        cursor: args.paginationOpts?.cursor ?? null,
      });
    const activity = await loadGroupMembershipActivity(ctx, args.groupId);
    const profileCache = new Map<Id<"userProfiles">, Doc<"userProfiles">>();
    for (const profileId of new Set(activity.memberships.map((row) => row.profileId))) {
      const profile = await ctx.db.get(profileId);
      if (profile) profileCache.set(profileId, profile);
    }
    const rows = [];

    // Process the whole event page so continueCursor never skips an incomplete
    // event. Page size is capped above to keep every transaction bounded.
    for (const event of eventPage.page) {
      if (event.cancelledAt) continue;
      const roster = await rosterForEvent(ctx, event, activity, profileCache);
      // Zero-required-member events are complete by definition.
      if (roster.isComplete) continue;
      rows.push({
        event,
        phase: event.endAt > args.now ? ("ongoing" as const) : ("past" as const),
        ...roster,
      });
    }

    return {
      rows,
      scannedEventCount: eventPage.page.length,
      isDone: eventPage.isDone,
      continueCursor: eventPage.continueCursor,
      hasMoreToScan: !eventPage.isDone,
      timeBucket: args.now,
    };
  },
});

/** Recent finalized rosters for a correction picker after client remounts. */
export const listRecentCompletedEvents = query({
  args: {
    groupId: v.id("groups"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireGroupCapability(ctx, args.groupId, "readAttendance");
    const now = Date.now();
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? 10), 1),
      MAX_RECENT_COMPLETED_EVENTS,
    );
    const events = await ctx.db
      .query("events")
      .withIndex("by_group_start", (q) =>
        q.eq("groupId", args.groupId).lte("startAt", now),
      )
      .order("desc")
      .take(MAX_RECENT_COMPLETED_SCAN_EVENTS);
    const activity = await loadGroupMembershipActivity(ctx, args.groupId);
    const profileCache = new Map<Id<"userProfiles">, Doc<"userProfiles">>();
    for (const profileId of new Set(activity.memberships.map((row) => row.profileId))) {
      const profile = await ctx.db.get(profileId);
      if (profile) profileCache.set(profileId, profile);
    }
    const rows = [];

    for (const event of events) {
      if (event.cancelledAt) continue;
      const roster = await rosterForEvent(ctx, event, activity, profileCache);
      if (!roster.isComplete) continue;
      rows.push({
        event,
        requiredCount: roster.requiredCount,
        markedRequiredCount: roster.markedRequiredCount,
      });
      if (rows.length >= limit) break;
    }

    return {
      rows,
      scannedEventCount: events.length,
      scanLimit: MAX_RECENT_COMPLETED_SCAN_EVENTS,
    };
  },
});

export const eventDetail = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    const access = await requireGroupCapability(ctx, event.groupId, "readAttendance");
    const activity = await loadGroupMembershipActivity(ctx, event.groupId);
    return {
      event,
      accessRole: access.accessRole,
      capabilities: access.capabilities,
      ...(await rosterForEvent(ctx, event, activity)),
    };
  },
});

export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    const leadership = await getLeadershipAccessForGroup(
      ctx,
      profile._id,
      event.groupId,
    );
    if (leadership?.capabilities.readAttendance) {
      return await attendanceForEvent(ctx, event._id);
    }

    const membership = await getConnectedMembershipForGroup(
      ctx,
      profile._id,
      event.groupId,
    );
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

  const periodsByMembership = new Map<
    Id<"memberships">,
    Doc<"membershipActivityPeriods">[]
  >();
  for (const membership of memberships) {
    const periods = await ctx.db
      .query("membershipActivityPeriods")
      .withIndex("by_membership_and_startedAt", (q) =>
        q.eq("membershipId", membership._id),
      )
      .take(201);
    if (periods.length > 200) {
      throw new Error("Membership history is too large for this query");
    }
    periodsByMembership.set(membership._id, periods);
  }

  const firstEligibleAt = Math.min(
    ...memberships.map((membership) => {
      const periods = periodsByMembership.get(membership._id) ?? [];
      return periods[0]?.startedAt ?? membership.joinedAt;
    }),
  );
  const now = Date.now();
  const rows = [];
  let totalPastEvents = 0;
  let presentEvents = 0;

  for await (const event of ctx.db
    .query("events")
    .withIndex("by_group_start", (q) =>
      q.eq("groupId", groupId).gte("startAt", firstEligibleAt),
    )
    .order("asc")) {
    if (event.startAt > now) break;
    if (event.endAt > now || event.cancelledAt) continue;
    const eligible = memberships.some((membership) =>
      isMembershipActiveAtFromRows(
        membership,
        periodsByMembership.get(membership._id) ?? [],
        event.startAt,
      ),
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

/** Legacy history for the first current membership. */
export const myHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const activeMembership = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", profile._id).eq("status", "active"),
      )
      .first();
    const inactiveMembership = activeMembership
      ? null
      : await ctx.db
          .query("memberships")
          .withIndex("by_profile_status", (q) =>
            q.eq("profileId", profile._id).eq("status", "inactive"),
          )
          .first();
    const membership = activeMembership ?? inactiveMembership;
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

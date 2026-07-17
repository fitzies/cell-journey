import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { approvePendingJoinRequest, rejectPendingJoinRequest } from "./joinRequestFlow";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_ROWS = 250;

type AuthUser = Doc<"users"> & {
  email?: string;
  name?: string;
  image?: string;
};

function allowedAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function generatedCode(name: string, now: number) {
  const prefix = normalizeCode(name)
    .replace(/[AEIOU]/g, "")
    .slice(0, 3)
    .padEnd(3, "C");
  return `${prefix}${String(now).slice(-3)}`;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const user = (await ctx.db.get(userId)) as AuthUser | null;
  const email = user?.email?.trim().toLowerCase();
  const allowed = allowedAdminEmails();

  if (allowed.length === 0) {
    throw new Error("Admin access is not configured. Set ADMIN_EMAILS in Convex env vars.");
  }
  if (!email || !allowed.includes(email)) {
    throw new Error("This account is not allowed to access admin tools.");
  }

  return { userId, user, email };
}

async function groupName(ctx: QueryCtx, groupId?: Id<"groups">) {
  if (!groupId) return null;
  return (await ctx.db.get(groupId))?.name ?? null;
}

async function userSummary(ctx: QueryCtx, userId: Id<"users">) {
  const user = (await ctx.db.get(userId)) as AuthUser | null;
  return {
    _id: user?._id ?? userId,
    name: user?.name ?? null,
    email: user?.email ?? null,
    image: user?.image ?? null,
  };
}

function publicProfile(profile: Doc<"userProfiles">) {
  return {
    _id: profile._id,
    userId: profile.userId,
    role: profile.role,
    onboardingStatus: profile.onboardingStatus,
    fullName: profile.fullName ?? null,
    preferredName: profile.preferredName ?? null,
    singaporeRegion: profile.singaporeRegion ?? null,
    currentGroupId: profile.currentGroupId ?? null,
    leaderGroupId: profile.leaderGroupId ?? null,
    activeMembershipId: profile.activeMembershipId ?? null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function effectiveAttendanceStatus(attendance: Doc<"attendance"> | undefined) {
  return attendance?.finalStatus ?? attendance?.memberSubmittedStatus ?? null;
}

function attendanceTotals(
  events: Doc<"events">[],
  memberships: Doc<"memberships">[],
  attendanceByEventAndProfile: Map<string, Doc<"attendance">>,
) {
  let present = 0;
  let expected = 0;

  for (const event of events) {
    const eligibleProfiles = new Set(
      memberships
        .filter(
          (membership) =>
            membership.joinedAt <= event.startAt &&
            (membership.endedAt === undefined || membership.endedAt >= event.startAt),
        )
        .map((membership) => membership.profileId),
    );

    expected += eligibleProfiles.size;
    for (const profileId of eligibleProfiles) {
      const attendance = attendanceByEventAndProfile.get(`${event._id}:${profileId}`);
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

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { isAdmin: false, email: null, name: null, reason: "notAuthenticated" as const };

    const user = (await ctx.db.get(userId)) as AuthUser | null;
    const email = user?.email?.trim().toLowerCase() ?? null;
    const allowed = allowedAdminEmails();
    if (allowed.length === 0) {
      return { isAdmin: false, email, name: user?.name ?? null, reason: "notConfigured" as const };
    }
    if (!email || !allowed.includes(email)) {
      return { isAdmin: false, email, name: user?.name ?? null, reason: "notAllowed" as const };
    }

    return { isAdmin: true, email, name: user?.name ?? null, reason: null };
  },
});

export const listUsers = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(args.limit ?? MAX_ROWS, MAX_ROWS);
    const search = args.search?.trim().toLowerCase() ?? "";

    const profiles = await ctx.db.query("userProfiles").order("desc").take(limit);
    const rows = [];

    for (const profile of profiles) {
      const user = await userSummary(ctx, profile.userId);
      const displayName = profile.preferredName || profile.fullName || user.name || user.email || "Unnamed user";
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "active"),
        )
        .take(100);
      const memberGroups = [];
      for (const membership of memberships) {
        const group = await ctx.db.get(membership.groupId);
        if (group) memberGroups.push({ membershipId: membership._id, groupId: group._id, name: group.name });
      }
      const ledGroupDocs = await ctx.db
        .query("groups")
        .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
        .take(100);
      const ledGroups = ledGroupDocs.map((group) => ({ groupId: group._id, name: group.name }));
      const haystack = [
        displayName,
        user.email,
        ...memberGroups.map((group) => group.name),
        ...ledGroups.map((group) => group.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (search && !haystack.includes(search)) continue;

      rows.push({
        profile: publicProfile(profile),
        user,
        displayName,
        memberGroups,
        ledGroups,
        currentGroupName: memberGroups[0]?.name ?? null,
        leaderGroupName: ledGroups[0]?.name ?? null,
      });
    }

    return rows;
  },
});

export const listGroups = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const groups = await ctx.db.query("groups").order("desc").take(Math.min(args.limit ?? MAX_ROWS, MAX_ROWS));
    const rows = [];

    for (const group of groups) {
      const leader = group.leaderProfileId ? await ctx.db.get(group.leaderProfileId) : null;
      const activeMembers = await ctx.db
        .query("memberships")
        .withIndex("by_group_status", (q) => q.eq("groupId", group._id).eq("status", "active"))
        .take(200);
      rows.push({
        group,
        leader: leader ? publicProfile(leader) : null,
        leaderName: leader?.preferredName || leader?.fullName || null,
        activeMemberCount: activeMembers.length,
      });
    }

    return rows;
  },
});

export const listGroupAttendance = query({
  args: {
    from: v.number(),
    to: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const to = Math.min(args.to, Date.now());
    const requestedWindow = Math.max(to - args.from, 1);
    const window = Math.min(requestedWindow, 366 * 24 * 60 * 60 * 1000);
    const from = to - window;
    const previousFrom = from - window;
    const groupPage = await ctx.db.query("groups").order("asc").paginate(args.paginationOpts);
    const rows = [];

    for (const group of groupPage.page) {
      const events = await ctx.db
        .query("events")
        .withIndex("by_group_start", (q) =>
          q.eq("groupId", group._id).gte("startAt", previousFrom).lte("startAt", to),
        )
        .order("desc")
        .take(160);
      const completedEvents = events.filter((event) => !event.cancelledAt && event.endAt <= to);
      const currentEvents = completedEvents.filter((event) => event.startAt >= from);
      const previousEvents = completedEvents.filter(
        (event) => event.startAt >= previousFrom && event.startAt < from,
      );

      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .take(1000);
      const attendanceRows = completedEvents.length === 0
        ? []
        : await ctx.db
            .query("attendance")
            .withIndex("by_group", (q) => q.eq("groupId", group._id))
            .order("desc")
            .take(1500);
      const relevantEventIds = new Set(completedEvents.map((event) => event._id));
      const attendanceByEventAndProfile = new Map<string, Doc<"attendance">>();

      for (const attendance of attendanceRows) {
        if (relevantEventIds.has(attendance.eventId)) {
          attendanceByEventAndProfile.set(
            `${attendance.eventId}:${attendance.profileId}`,
            attendance,
          );
        }
      }

      const current = attendanceTotals(currentEvents, memberships, attendanceByEventAndProfile);
      const previous = attendanceTotals(previousEvents, memberships, attendanceByEventAndProfile);
      const leader = group.leaderProfileId ? await ctx.db.get(group.leaderProfileId) : null;
      const lastEvent = currentEvents[0] ?? null;

      rows.push({
        group: {
          _id: group._id,
          name: group.name,
          code: group.code,
          isActive: group.isActive,
        },
        leaderName: leader?.preferredName || leader?.fullName || null,
        activeMemberCount: memberships.filter((membership) => membership.status === "active").length,
        eventCount: currentEvents.length,
        presentCount: current.present,
        absentCount: current.absent,
        expectedCount: current.expected,
        attendanceRate: current.rate,
        previousAttendanceRate: previous.rate,
        rateChange:
          current.rate === null || previous.rate === null ? null : current.rate - previous.rate,
        lastEvent: lastEvent
          ? { _id: lastEvent._id, title: lastEvent.title, startAt: lastEvent.startAt }
          : null,
        isComplete: events.length < 160 && memberships.length < 1000 && attendanceRows.length < 1500,
      });
    }

    return { ...groupPage, page: rows };
  },
});

export const listPendingJoinRequests = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const requests = await ctx.db
      .query("joinRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(Math.min(args.limit ?? 100, 100));
    const rows = [];
    for (const request of requests) {
      const profile = await ctx.db.get(request.profileId);
      const group = await ctx.db.get(request.groupId);
      rows.push({ request, profile: profile ? publicProfile(profile) : null, group });
    }
    return rows;
  },
});

export const approveJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const reviewer = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return await approvePendingJoinRequest(ctx, args.joinRequestId, {
      reviewedByProfileId: reviewer?._id ?? null,
    });
  },
});

export const rejectJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const reviewer = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return await rejectPendingJoinRequest(ctx, args.joinRequestId, {
      reviewedByProfileId: reviewer?._id ?? null,
      reason: args.reason,
    });
  },
});

export const createGroup = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Group name is required");

    const now = Date.now();
    const code = normalizeCode(args.code?.trim() || generatedCode(name, now));
    if (code.length !== 6) throw new Error("Group code must be exactly 6 letters/numbers");

    const existing = await ctx.db.query("groups").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (existing) throw new Error("Group code is already in use");

    const groupId = await ctx.db.insert("groups", {
      name,
      code,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(groupId);
  },
});

export const updateGroup = mutation({
  args: {
    groupId: v.id("groups"),
    name: v.string(),
    code: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");

    const name = args.name.trim();
    const code = normalizeCode(args.code);
    if (!name) throw new Error("Group name is required");
    if (code.length !== 6) throw new Error("Group code must be exactly 6 letters/numbers");

    const existing = await ctx.db.query("groups").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (existing && existing._id !== group._id) throw new Error("Group code is already in use");

    await ctx.db.patch(group._id, { name, code, isActive: args.isActive, updatedAt: Date.now() });
    return await ctx.db.get(group._id);
  },
});

async function syncCompatibilityRole(ctx: MutationCtx, profileId: Id<"userProfiles">) {
  const profile = await ctx.db.get(profileId);
  if (!profile) return;
  const ledGroup = await ctx.db
    .query("groups")
    .withIndex("by_leader", (q) => q.eq("leaderProfileId", profileId))
    .first();
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_profile_status", (q) =>
      q.eq("profileId", profileId).eq("status", "active"),
    )
    .first();
  const pending = await ctx.db
    .query("joinRequests")
    .withIndex("by_profile_status", (q) =>
      q.eq("profileId", profileId).eq("status", "pending"),
    )
    .first();
  const compatibilityMembership = profile.activeMembershipId
    ? await ctx.db.get(profile.activeMembershipId)
    : null;
  const shouldReplaceCompatibilityMembership =
    !compatibilityMembership ||
    compatibilityMembership.profileId !== profile._id ||
    compatibilityMembership.status !== "active" ||
    compatibilityMembership.groupId !== profile.currentGroupId;
  const profileComplete = Boolean(
    profile.fullName?.trim() && profile.singaporeRegion && profile.serviceIds.length > 0,
  );
  await ctx.db.patch(profileId, {
    role: ledGroup ? "leader" : "member",
    leaderGroupId: ledGroup?._id,
    ...(shouldReplaceCompatibilityMembership
      ? { activeMembershipId: membership?._id, currentGroupId: membership?.groupId }
      : {}),
    onboardingStatus: !profileComplete
      ? "profileIncomplete"
      : ledGroup || membership
        ? "approved"
        : pending
          ? "pendingApproval"
          : "needsGroup",
    updatedAt: Date.now(),
  });
}

export const setGroupLeader = mutation({
  args: {
    groupId: v.id("groups"),
    profileId: v.union(v.id("userProfiles"), v.null()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");
    const previousLeaderId = group.leaderProfileId;
    if (args.profileId) {
      const profile = await ctx.db.get(args.profileId);
      if (!profile) throw new Error("Profile not found");
    }

    await ctx.db.patch(group._id, {
      leaderProfileId: args.profileId ?? undefined,
      updatedAt: Date.now(),
    });
    if (previousLeaderId && previousLeaderId !== args.profileId) {
      await syncCompatibilityRole(ctx, previousLeaderId);
    }
    if (args.profileId) await syncCompatibilityRole(ctx, args.profileId);
    return null;
  },
});

export const removeGroupLeader = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");
    const previousLeaderId = group.leaderProfileId;
    await ctx.db.patch(group._id, { leaderProfileId: undefined, updatedAt: Date.now() });
    if (previousLeaderId) await syncCompatibilityRole(ctx, previousLeaderId);
    return null;
  },
});

/** Legacy global demotion is safe only for a profile leading one group. */
export const demoteLeader = mutation({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_leader", (q) => q.eq("leaderProfileId", args.profileId))
      .take(2);
    if (groups.length > 1) throw new Error("Remove leadership from a specific group");
    if (groups[0]) {
      await ctx.db.patch(groups[0]._id, { leaderProfileId: undefined, updatedAt: Date.now() });
    }
    await syncCompatibilityRole(ctx, args.profileId);
    return null;
  },
});

export const assignMemberToGroup = mutation({
  args: {
    profileId: v.id("userProfiles"),
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await ctx.db.get(args.profileId);
    const group = await ctx.db.get(args.groupId);
    if (!profile) throw new Error("Profile not found");
    if (!group || !group.isActive) throw new Error("Active group not found");

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_profile_and_group_and_status", (q) =>
        q.eq("profileId", profile._id).eq("groupId", group._id).eq("status", "active"),
      )
      .unique();
    const pending = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_and_group_and_status", (q) =>
        q.eq("profileId", profile._id).eq("groupId", group._id).eq("status", "pending"),
      )
      .unique();

    const now = Date.now();
    if (!existing) {
      await ctx.db.insert("memberships", {
        profileId: profile._id,
        groupId: group._id,
        status: "active",
        joinedAt: now,
        ...(pending ? { joinRequestId: pending._id } : {}),
      });
    }
    if (pending) {
      await ctx.db.patch(pending._id, { status: "approved", reviewedAt: now });
    }
    await syncCompatibilityRole(ctx, profile._id);
    return null;
  },
});

export const removeMembership = mutation({
  args: { profileId: v.id("userProfiles"), groupId: v.id("groups") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_profile_and_group_and_status", (q) =>
        q.eq("profileId", args.profileId).eq("groupId", args.groupId).eq("status", "active"),
      )
      .unique();
    if (!membership) return null;
    await ctx.db.patch(membership._id, {
      status: "removed",
      endedAt: Date.now(),
      endReason: "removedByAdmin",
    });
    await syncCompatibilityRole(ctx, args.profileId);
    return null;
  },
});

/** Legacy removal is safe only for a profile with one active membership. */
export const removeMemberFromGroup = mutation({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", args.profileId).eq("status", "active"),
      )
      .take(2);
    if (memberships.length > 1) throw new Error("Select a specific group membership to remove");
    if (!memberships[0]) return null;
    await ctx.db.patch(memberships[0]._id, {
      status: "removed",
      endedAt: Date.now(),
      endReason: "removedByAdmin",
    });
    await syncCompatibilityRole(ctx, args.profileId);
    return null;
  },
});

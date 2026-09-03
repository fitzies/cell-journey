import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { approvePendingJoinRequest, rejectPendingJoinRequest } from "./joinRequestFlow";
import type { Doc, Id } from "./_generated/dataModel";
import {
  CO_LEADER_CAPABILITIES,
  OWNER_CAPABILITIES,
  getConnectedMembershipForGroup,
  getProfileDisplayName,
  isProfileComplete,
  normalizeEmail,
} from "./profiles";
import {
  closeActivityPeriod,
  isMembershipActiveAtFromRows,
} from "./membershipActivity";
import { nextSortOrder } from "./membershipOrdering";

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
  if (typeof user?.emailVerificationTime !== "number") {
    throw new Error("Verify your email before accessing admin tools.");
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
    userId: profile.userId ?? null,
    role: profile.role,
    onboardingStatus: profile.onboardingStatus,
    firstName: profile.firstName ?? null,
    lastName: profile.lastName ?? null,
    fullName: profile.fullName ?? null,
    preferredName: profile.preferredName ?? null,
    displayName: getProfileDisplayName(profile),
    profileComplete: isProfileComplete(profile),
    singaporeRegion: profile.singaporeRegion ?? null,
    currentGroupId: profile.currentGroupId ?? null,
    leaderGroupId: profile.leaderGroupId ?? null,
    activeMembershipId: profile.activeMembershipId ?? null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function validateInviteEmail(value: string) {
  const email = normalizeEmail(value);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address");
  }
  return email;
}

function effectiveAttendanceStatus(attendance: Doc<"attendance"> | undefined) {
  return attendance?.finalStatus ?? attendance?.memberSubmittedStatus ?? null;
}

function attendanceTotals(
  events: Doc<"events">[],
  memberships: Doc<"memberships">[],
  periodsByMembership: Map<Id<"memberships">, Doc<"membershipActivityPeriods">[]>,
  attendanceByEventAndProfile: Map<string, Doc<"attendance">>,
) {
  let present = 0;
  let expected = 0;

  for (const event of events) {
    const eligibleProfiles = new Set(
      memberships
        .filter((membership) =>
          isMembershipActiveAtFromRows(
            membership,
            periodsByMembership.get(membership._id) ?? [],
            event.startAt,
          ),
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
    if (typeof user?.emailVerificationTime !== "number") {
      return { isAdmin: false, email, name: user?.name ?? null, reason: "emailNotVerified" as const };
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
      const user = profile.userId
        ? await userSummary(ctx, profile.userId)
        : {
            _id: null,
            name: getProfileDisplayName(profile),
            email: profile.invitedEmail ?? null,
            image: null,
          };
      const accountStatus = profile.userId ? "active" as const : "awaitingSignIn" as const;
      const displayName = getProfileDisplayName(profile) || user.name || user.email || "Unnamed user";
      const activeMemberships = await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "active"),
        )
        .take(100);
      const inactiveMemberships = await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "inactive"),
        )
        .take(100);
      const memberGroups = [];
      for (const membership of [...activeMemberships, ...inactiveMemberships]) {
        const group = await ctx.db.get(membership.groupId);
        if (group) memberGroups.push({
          membershipId: membership._id,
          groupId: group._id,
          name: group.name,
          status: membership.status,
        });
      }
      const ledGroupDocs = await ctx.db
        .query("groups")
        .withIndex("by_leader", (q) => q.eq("leaderProfileId", profile._id))
        .take(100);
      const ledGroups: Array<{
        groupId: Id<"groups">;
        name: string;
        accessRole: "owner" | "coLeader";
      }> = ledGroupDocs.map((group) => ({
        groupId: group._id,
        name: group.name,
        accessRole: "owner" as const,
      }));
      const coLeaderAssignments = await ctx.db
        .query("coLeaderAssignments")
        .withIndex("by_profile_and_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "active"),
        )
        .take(100);
      for (const assignment of coLeaderAssignments) {
        if (ledGroups.some((group) => group.groupId === assignment.groupId)) continue;
        const group = await ctx.db.get(assignment.groupId);
        if (group) ledGroups.push({
          groupId: group._id,
          name: group.name,
          accessRole: "coLeader" as const,
        });
      }
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
        accountStatus,
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

export const createInvitedProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId: invitedByUserId } = await requireAdmin(ctx);
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName || !lastName) {
      throw new Error("First and last name are required");
    }
    const email = validateInviteEmail(args.email);

    const [invitedMatches, identityMatches, authUsers] = await Promise.all([
      ctx.db
        .query("userProfiles")
        .withIndex("by_invitedEmail", (q) => q.eq("invitedEmail", email))
        .take(2),
      ctx.db
        .query("userProfiles")
        .withIndex("by_identityEmailNormalized", (q) =>
          q.eq("identityEmailNormalized", email),
        )
        .take(2),
      ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).take(2),
    ]);

    const matchingProfiles = new Map(
      [...invitedMatches, ...identityMatches].map((profile) => [profile._id, profile]),
    );

    // Transitional safeguard for profiles created before normalized identity
    // emails were stored. Convex Auth preserves provider casing, so the users
    // email index alone cannot detect every case-insensitive match.
    const legacyLinkedProfiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_identityEmailNormalized", (q) =>
        q.eq("identityEmailNormalized", undefined),
      )
      .collect();
    for (const profile of legacyLinkedProfiles) {
      if (!profile.userId) continue;
      const linkedUser = (await ctx.db.get(profile.userId)) as AuthUser | null;
      if (linkedUser?.email && normalizeEmail(linkedUser.email) === email) {
        matchingProfiles.set(profile._id, profile);
      }
    }

    for (const authUser of authUsers) {
      const linkedProfiles = await ctx.db
        .query("userProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", authUser._id))
        .take(2);
      for (const profile of linkedProfiles) matchingProfiles.set(profile._id, profile);
    }
    if (matchingProfiles.size > 0) {
      throw new Error("A profile already uses this email address");
    }

    const now = Date.now();
    const profileId = await ctx.db.insert("userProfiles", {
      invitedEmail: email,
      invitedAt: now,
      invitedByUserId,
      role: "member",
      onboardingStatus: "profileIncomplete",
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      serviceIds: [],
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(profileId);
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
      const coLeaderAssignments = await ctx.db
        .query("coLeaderAssignments")
        .withIndex("by_group_and_status", (q) =>
          q.eq("groupId", group._id).eq("status", "active"),
        )
        .take(100);
      const coLeaders = [];
      for (const assignment of coLeaderAssignments) {
        const profile = await ctx.db.get(assignment.profileId);
        if (profile) {
          coLeaders.push({
            assignment,
            profile: publicProfile(profile),
            displayName: getProfileDisplayName(profile),
            capabilities: CO_LEADER_CAPABILITIES,
          });
        }
      }
      const activeMembers = await ctx.db
        .query("memberships")
        .withIndex("by_group_status", (q) => q.eq("groupId", group._id).eq("status", "active"))
        .take(200);
      rows.push({
        group,
        leader: leader ? publicProfile(leader) : null,
        leaderName: leader ? getProfileDisplayName(leader) : null,
        leaderCapabilities: leader ? OWNER_CAPABILITIES : null,
        coLeaders,
        activeMemberCount: activeMembers.length,
      });
    }

    return rows;
  },
});

export const listServices = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("services")
      .withIndex("by_sort_order")
      .take(Math.min(args.limit ?? MAX_ROWS, MAX_ROWS));
  },
});

export const listCoLeaderAssignments = query({
  args: {
    groupId: v.optional(v.id("groups")),
    status: v.optional(v.union(v.literal("active"), v.literal("revoked"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(args.limit ?? MAX_ROWS, MAX_ROWS);
    const assignments = args.groupId
      ? await ctx.db
          .query("coLeaderAssignments")
          .withIndex("by_group_and_status", (q) =>
            args.status
              ? q.eq("groupId", args.groupId!).eq("status", args.status)
              : q.eq("groupId", args.groupId!),
          )
          .take(limit)
      : await ctx.db.query("coLeaderAssignments").order("desc").take(limit);
    const rows = [];
    for (const assignment of assignments) {
      if (args.status && assignment.status !== args.status) continue;
      const profile = await ctx.db.get(assignment.profileId);
      const group = await ctx.db.get(assignment.groupId);
      rows.push({
        assignment,
        group,
        profile: profile ? publicProfile(profile) : null,
        displayName: profile ? getProfileDisplayName(profile) : null,
        capabilities: CO_LEADER_CAPABILITIES,
      });
    }
    return rows;
  },
});

export const assignCoLeader = mutation({
  args: { groupId: v.id("groups"), profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const group = await ctx.db.get(args.groupId);
    const profile = await ctx.db.get(args.profileId);
    if (!group) throw new Error("Group not found");
    if (!profile) throw new Error("Profile not found");
    if (group.leaderProfileId === profile._id) {
      throw new Error("The group owner cannot also be assigned as a co-leader");
    }
    const existing = await ctx.db
      .query("coLeaderAssignments")
      .withIndex("by_profile_and_group_and_status", (q) =>
        q
          .eq("profileId", profile._id)
          .eq("groupId", group._id)
          .eq("status", "active"),
      )
      .unique();
    if (existing) return existing;

    const now = Date.now();
    const assignmentId = await ctx.db.insert("coLeaderAssignments", {
      groupId: group._id,
      profileId: profile._id,
      status: "active",
      assignedAt: now,
      assignedByKind: "admin",
      assignedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await syncCompatibilityRole(ctx, profile._id);
    return await ctx.db.get(assignmentId);
  },
});

export const revokeCoLeader = mutation({
  args: {
    assignmentId: v.id("coLeaderAssignments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Co-leader assignment not found");
    if (assignment.status === "revoked") return assignment;
    const now = Date.now();
    await ctx.db.patch(assignment._id, {
      status: "revoked",
      revokedAt: now,
      revokedByKind: "admin",
      revokedByUserId: userId,
      revocationReason: args.reason?.trim() || undefined,
      updatedAt: now,
    });
    await syncCompatibilityRole(ctx, assignment.profileId);
    return await ctx.db.get(assignment._id);
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
      const activityPeriods = await ctx.db
        .query("membershipActivityPeriods")
        .withIndex("by_group_and_startedAt", (q) =>
          q.eq("groupId", group._id).lte("startedAt", to),
        )
        .take(3001);
      const periodsByMembership = new Map<
        Id<"memberships">,
        Doc<"membershipActivityPeriods">[]
      >();
      for (const period of activityPeriods) {
        const rows = periodsByMembership.get(period.membershipId) ?? [];
        rows.push(period);
        periodsByMembership.set(period.membershipId, rows);
      }
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

      const current = attendanceTotals(
        currentEvents,
        memberships,
        periodsByMembership,
        attendanceByEventAndProfile,
      );
      const previous = attendanceTotals(
        previousEvents,
        memberships,
        periodsByMembership,
        attendanceByEventAndProfile,
      );
      const leader = group.leaderProfileId ? await ctx.db.get(group.leaderProfileId) : null;
      const lastEvent = currentEvents[0] ?? null;

      rows.push({
        group: {
          _id: group._id,
          name: group.name,
          code: group.code,
          isActive: group.isActive,
        },
        leaderName: leader ? getProfileDisplayName(leader) : null,
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
        isComplete:
          events.length < 160 &&
          memberships.length < 1000 &&
          activityPeriods.length < 3001 &&
          attendanceRows.length < 1500,
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
      .withIndex("by_userId", (q) => q.eq("userId", userId))
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
      .withIndex("by_userId", (q) => q.eq("userId", userId))
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

export const deleteGroup = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");
    if (group.isActive) throw new Error("Only archived groups can be deleted");
    if (group.leaderProfileId) throw new Error("Remove the group leader before deleting this group");

    const [activeCoLeaders, revokedCoLeaders] = await Promise.all([
      ctx.db.query("coLeaderAssignments").withIndex("by_group_and_status", (q) => q.eq("groupId", args.groupId).eq("status", "active")).take(1),
      ctx.db.query("coLeaderAssignments").withIndex("by_group_and_status", (q) => q.eq("groupId", args.groupId).eq("status", "revoked")).take(1),
    ]);
    if (activeCoLeaders.length || revokedCoLeaders.length) throw new Error("This group has leadership history and cannot be deleted");

    const [memberships, joinRequests, activityPeriods, events, attendance] = await Promise.all([
      ctx.db.query("memberships").withIndex("by_group", (q) => q.eq("groupId", args.groupId)).take(1),
      ctx.db.query("joinRequests").withIndex("by_group_status", (q) => q.eq("groupId", args.groupId).eq("status", "pending")).take(1),
      ctx.db.query("membershipActivityPeriods").withIndex("by_group_and_startedAt", (q) => q.eq("groupId", args.groupId)).take(1),
      ctx.db.query("events").withIndex("by_group_start", (q) => q.eq("groupId", args.groupId)).take(1),
      ctx.db.query("attendance").withIndex("by_group", (q) => q.eq("groupId", args.groupId)).take(1),
    ]);
    if (memberships.length || joinRequests.length || activityPeriods.length || events.length || attendance.length) {
      throw new Error("This group has history or pending data and cannot be deleted. Keep it archived instead.");
    }

    const profilesUsingGroup = await ctx.db.query("userProfiles").withIndex("by_current_group", (q) => q.eq("currentGroupId", args.groupId)).take(1);
    if (profilesUsingGroup.length) throw new Error("A user profile still references this group");

    await ctx.db.delete(args.groupId);
    return { deleted: true };
  },
});

function cleanServiceName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validateServiceSortOrder(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Display order must be a whole number of 0 or more");
  }
}

async function serviceWithName(
  ctx: QueryCtx | MutationCtx,
  name: string,
  excludeId?: Id<"services">,
) {
  const normalizedName = name.toLocaleLowerCase("en-SG");
  const services = await ctx.db.query("services").take(MAX_ROWS);
  return services.find(
    (service) =>
      service._id !== excludeId &&
      service.name.toLocaleLowerCase("en-SG") === normalizedName,
  );
}

export const createService = mutation({
  args: {
    name: v.string(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = cleanServiceName(args.name);
    if (!name) throw new Error("Service name is required");
    validateServiceSortOrder(args.sortOrder);
    if (await serviceWithName(ctx, name)) {
      throw new Error("A service with this name already exists");
    }

    const now = Date.now();
    const serviceId = await ctx.db.insert("services", {
      name,
      sortOrder: args.sortOrder,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(serviceId);
  },
});

export const updateService = mutation({
  args: {
    serviceId: v.id("services"),
    name: v.string(),
    sortOrder: v.number(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new Error("Service not found");

    const name = cleanServiceName(args.name);
    if (!name) throw new Error("Service name is required");
    validateServiceSortOrder(args.sortOrder);
    if (await serviceWithName(ctx, name, service._id)) {
      throw new Error("A service with this name already exists");
    }

    await ctx.db.patch(service._id, {
      name,
      sortOrder: args.sortOrder,
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(service._id);
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
  const inactiveMembership = membership
    ? null
    : await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", profileId).eq("status", "inactive"),
        )
        .first();
  const coLeadership = await ctx.db
    .query("coLeaderAssignments")
    .withIndex("by_profile_and_status", (q) =>
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
  const profileComplete = isProfileComplete(profile);
  await ctx.db.patch(profileId, {
    role: ledGroup || coLeadership ? "leader" : "member",
    leaderGroupId: ledGroup?._id,
    ...(shouldReplaceCompatibilityMembership
      ? { activeMembershipId: membership?._id, currentGroupId: membership?.groupId }
      : {}),
    onboardingStatus: !profileComplete
      ? "profileIncomplete"
      : ledGroup || coLeadership || membership || inactiveMembership
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
    const { userId } = await requireAdmin(ctx);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");
    const previousLeaderId = group.leaderProfileId;
    if (args.profileId) {
      const profile = await ctx.db.get(args.profileId);
      if (!profile) throw new Error("Profile not found");
    }

    const now = Date.now();
    await ctx.db.patch(group._id, {
      leaderProfileId: args.profileId ?? undefined,
      updatedAt: now,
    });
    if (args.profileId) {
      const redundantAssignment = await ctx.db
        .query("coLeaderAssignments")
        .withIndex("by_profile_and_group_and_status", (q) =>
          q
            .eq("profileId", args.profileId!)
            .eq("groupId", group._id)
            .eq("status", "active"),
        )
        .unique();
      if (redundantAssignment) {
        await ctx.db.patch(redundantAssignment._id, {
          status: "revoked",
          revokedAt: now,
          revokedByKind: "admin",
          revokedByUserId: userId,
          revocationReason: "Assigned as primary owner",
          updatedAt: now,
        });
      }
    }
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

    const existing = await getConnectedMembershipForGroup(
      ctx,
      profile._id,
      group._id,
    );
    const pending = await ctx.db
      .query("joinRequests")
      .withIndex("by_profile_and_group_and_status", (q) =>
        q.eq("profileId", profile._id).eq("groupId", group._id).eq("status", "pending"),
      )
      .unique();

    const now = Date.now();
    if (!existing) {
      const membershipId = await ctx.db.insert("memberships", {
        profileId: profile._id,
        groupId: group._id,
        status: "active",
        joinedAt: now,
        sortOrder: await nextSortOrder(ctx, group._id, "active"),
        ...(pending ? { joinRequestId: pending._id } : {}),
      });
      const membership = await ctx.db.get(membershipId);
      if (!membership) throw new Error("Membership was not created");
      await ctx.db.insert("membershipActivityPeriods", {
        membershipId: membership._id,
        profileId: membership.profileId,
        groupId: membership.groupId,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
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
    const membership = await getConnectedMembershipForGroup(
      ctx,
      args.profileId,
      args.groupId,
    );
    if (!membership) return null;
    const now = Date.now();
    if (membership.status === "active") await closeActivityPeriod(ctx, membership, now);
    await ctx.db.patch(membership._id, {
      status: "removed",
      endedAt: now,
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
    const activeMemberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", args.profileId).eq("status", "active"),
      )
      .take(2);
    const inactiveMemberships = await ctx.db
      .query("memberships")
      .withIndex("by_profile_status", (q) =>
        q.eq("profileId", args.profileId).eq("status", "inactive"),
      )
      .take(2);
    const memberships = [...activeMemberships, ...inactiveMemberships];
    if (memberships.length > 1) throw new Error("Select a specific group membership to remove");
    if (!memberships[0]) return null;
    const now = Date.now();
    if (memberships[0].status === "active") {
      await closeActivityPeriod(ctx, memberships[0], now);
    }
    await ctx.db.patch(memberships[0]._id, {
      status: "removed",
      endedAt: now,
      endReason: "removedByAdmin",
    });
    await syncCompatibilityRole(ctx, args.profileId);
    return null;
  },
});

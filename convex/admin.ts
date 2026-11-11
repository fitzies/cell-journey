import { anonymizeProfile, deleteUserAccount } from "./accountDeletion";
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
} from "./profiles";
import { closeActivityPeriod } from "./membershipActivity";
import {
  accessibleGroups,
  assignedByKind,
  canAccessGroup,
  requireAdmin,
  requireDashboardAccess,
  requireDashboardGroup,
  resolveDashboardAccess,
  type DashboardAccess,
} from "./dashboardAccess";
import {
  attendanceTotals,
  attendanceWindow,
  loadGroupAttendanceWindow,
  memberAttendanceStats,
} from "./dashboardAttendance";
import {
  addProfileToGroup,
  insertInvitedProfile,
  scheduleGroupInviteEmail,
  syncCompatibilityRole,
} from "./memberAdding";
import { groupDetailsArgs, sexValidator } from "./validators";
import { groupDetailsPatch } from "./groupDetails";

const MAX_ROWS = 250;

type AuthUser = Doc<"users"> & {
  email?: string;
  name?: string;
  image?: string;
};

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

async function reviewerProfileId(ctx: MutationCtx, access: DashboardAccess) {
  return access.profile?._id ?? null;
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

async function publicProfile(ctx: QueryCtx, profile: Doc<"userProfiles">) {
  return {
    photoUrl: profile.avatarStorageId ? await ctx.storage.getUrl(profile.avatarStorageId) : null,
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
    postalDistrict: profile.postalDistrict ?? null,
    singaporeRegion: profile.singaporeRegion ?? null,
    dateOfBirth: profile.dateOfBirth ?? null,
    sex: profile.sex ?? null,
    phone: profile.phone ?? null,
    currentGroupId: profile.currentGroupId ?? null,
    leaderGroupId: profile.leaderGroupId ?? null,
    activeMembershipId: profile.activeMembershipId ?? null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const result = await resolveDashboardAccess(ctx);
    if (!result.access) {
      return {
        isAdmin: false,
        hasAccess: false,
        role: null,
        regions: [],
        email: result.user?.email?.trim().toLowerCase() ?? null,
        name: result.user?.name ?? null,
        reason: result.reason,
      };
    }
    const { access } = result;
    return {
      isAdmin: access.kind === "admin",
      hasAccess: true,
      role: access.kind === "admin" ? ("admin" as const) : ("regionalLeader" as const),
      regions: access.kind === "regional"
        ? access.regions.map((region) => ({ _id: region._id, name: region.name }))
        : [],
      email: access.email,
      name: access.user.name ?? null,
      reason: null,
    };
  },
});

/** Profiles connected to the given groups as members, owners or co-leaders. */
async function profilesInGroups(ctx: QueryCtx, groupIds: Iterable<Id<"groups">>, limit: number) {
  const profileIds = new Set<Id<"userProfiles">>();
  for (const groupId of groupIds) {
    const group = await ctx.db.get(groupId);
    if (group?.leaderProfileId) profileIds.add(group.leaderProfileId);
    for (const status of ["active", "inactive"] as const) {
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_group_status", (q) => q.eq("groupId", groupId).eq("status", status))
        .take(500);
      for (const membership of memberships) profileIds.add(membership.profileId);
    }
    const coLeaders = await ctx.db
      .query("coLeaderAssignments")
      .withIndex("by_group_and_status", (q) => q.eq("groupId", groupId).eq("status", "active"))
      .take(100);
    for (const assignment of coLeaders) profileIds.add(assignment.profileId);
  }
  const profiles: Doc<"userProfiles">[] = [];
  for (const profileId of profileIds) {
    const profile = await ctx.db.get(profileId);
    if (profile && profile.deletedAt === undefined) profiles.push(profile);
  }
  return profiles.sort((a, b) => b._creationTime - a._creationTime).slice(0, limit);
}

export const listUsers = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    const limit = Math.min(args.limit ?? MAX_ROWS, MAX_ROWS);
    const search = args.search?.trim().toLowerCase() ?? "";

    const profiles = access.kind === "admin"
      ? await ctx.db.query("userProfiles").withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined)).order("desc").take(limit)
      : await profilesInGroups(ctx, access.groupIds, limit);
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
        if (!canAccessGroup(access, membership.groupId)) continue;
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
      }> = ledGroupDocs.filter((group) => canAccessGroup(access, group._id)).map((group) => ({
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
        if (!canAccessGroup(access, assignment.groupId)) continue;
        const group = await ctx.db.get(assignment.groupId);
        if (group) ledGroups.push({
          groupId: group._id,
          name: group.name,
          accessRole: "coLeader" as const,
        });
      }
      const regionalAssignments = await ctx.db
        .query("regionalLeaderAssignments")
        .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
        .take(50);
      const regionalRegions = [];
      for (const assignment of regionalAssignments) {
        const region = await ctx.db.get(assignment.regionId);
        if (region) regionalRegions.push({ assignmentId: assignment._id, regionId: region._id, name: region.name });
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
        profile: await publicProfile(ctx, profile),
        user,
        accountStatus,
        displayName,
        memberGroups,
        ledGroups,
        regionalRegions,
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
    // Adds the new person straight into this group and emails them.
    groupId: v.optional(v.id("groups")),
    dateOfBirth: v.optional(v.string()),
    sex: v.optional(sexValidator),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    if (access.kind === "regional" && !args.groupId) {
      throw new Error("Choose one of your groups for this person");
    }
    const group = args.groupId ? await requireDashboardGroup(ctx, access, args.groupId) : null;
    if (group && !group.isActive) throw new Error("Active group not found");

    const profileId = await insertInvitedProfile(ctx, { ...args, invitedByUserId: access.userId });
    if (group) {
      await addProfileToGroup(ctx, profileId, group._id, access.profile?._id);
      const profile = await ctx.db.get(profileId);
      await scheduleGroupInviteEmail(ctx, {
        email: profile!.invitedEmail!,
        firstName: profile!.firstName!,
        groupName: group.name,
        addedByName: access.profile ? getProfileDisplayName(access.profile) : null,
        isNewAccount: true,
      });
    }
    return await ctx.db.get(profileId);
  },
});

export const listGroups = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    const groups = await accessibleGroups(ctx, access, Math.min(args.limit ?? MAX_ROWS, MAX_ROWS));
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
            profile: await publicProfile(ctx, profile),
            displayName: getProfileDisplayName(profile),
            capabilities: CO_LEADER_CAPABILITIES,
          });
        }
      }
      const activeMembers = await ctx.db
        .query("memberships")
        .withIndex("by_group_status", (q) => q.eq("groupId", group._id).eq("status", "active"))
        .take(200);
      const region = group.regionId ? await ctx.db.get(group.regionId) : null;
      rows.push({
        group,
        region: region ? { _id: region._id, name: region.name } : null,
        leader: leader ? await publicProfile(ctx, leader) : null,
        leaderName: leader ? getProfileDisplayName(leader) : null,
        leaderCapabilities: leader ? OWNER_CAPABILITIES : null,
        coLeaders,
        activeMemberCount: activeMembers.length,
      });
    }

    return rows;
  },
});

export const listGroupMembers = query({
  args: { groupId: v.id("groups"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    await requireDashboardGroup(ctx, access, args.groupId);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_group_status", (q) =>
        q.eq("groupId", args.groupId).eq("status", "active"),
      )
      .take(Math.min(args.limit ?? 200, 200));
    const rows = [];
    for (const membership of memberships) {
      const profile = await ctx.db.get(membership.profileId);
      if (!profile || profile.deletedAt !== undefined) continue;
      const user = profile.userId
        ? await userSummary(ctx, profile.userId)
        : {
            _id: null,
            name: getProfileDisplayName(profile),
            email: profile.invitedEmail ?? null,
            image: null,
          };
      const displayName = getProfileDisplayName(profile) || user.email || "Unnamed member";
      rows.push({
        membershipId: membership._id,
        joinedAt: membership.joinedAt,
        memberClass: membership.memberClass ?? null,
        profile: await publicProfile(ctx, profile),
        displayName,
        email: user.email,
      });
    }
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
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
    const access = await requireDashboardAccess(ctx);
    if (args.groupId) await requireDashboardGroup(ctx, access, args.groupId);
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
      if (!canAccessGroup(access, assignment.groupId)) continue;
      const profile = await ctx.db.get(assignment.profileId);
      const group = await ctx.db.get(assignment.groupId);
      rows.push({
        assignment,
        group,
        profile: profile ? await publicProfile(ctx, profile) : null,
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
    const access = await requireDashboardAccess(ctx);
    const group = await requireDashboardGroup(ctx, access, args.groupId);
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.deletedAt !== undefined) throw new Error("Profile not found");
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
      assignedByKind: assignedByKind(access),
      assignedByUserId: access.userId,
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
    const access = await requireDashboardAccess(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || !canAccessGroup(access, assignment.groupId)) {
      throw new Error("Co-leader assignment not found");
    }
    if (assignment.status === "revoked") return assignment;
    const now = Date.now();
    await ctx.db.patch(assignment._id, {
      status: "revoked",
      revokedAt: now,
      revokedByKind: assignedByKind(access),
      revokedByUserId: access.userId,
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
    const access = await requireDashboardAccess(ctx);
    const window = attendanceWindow(args);
    const groupPage = await ctx.db.query("groups").order("asc").paginate(args.paginationOpts);
    const rows = [];

    for (const group of groupPage.page) {
      if (!canAccessGroup(access, group._id)) continue;
      const data = await loadGroupAttendanceWindow(ctx, group._id, window);
      const current = attendanceTotals(data, data.currentEvents);
      const previous = attendanceTotals(data, data.previousEvents);
      const leader = group.leaderProfileId ? await ctx.db.get(group.leaderProfileId) : null;
      const region = group.regionId ? await ctx.db.get(group.regionId) : null;
      const lastEvent = data.currentEvents[0] ?? null;
      const { byProfile } = memberAttendanceStats(data);

      rows.push({
        group: {
          _id: group._id,
          name: group.name,
          code: group.code,
          isActive: group.isActive,
        },
        regionName: region?.name ?? null,
        leaderName: leader ? getProfileDisplayName(leader) : null,
        activeMemberCount: data.memberships.filter((membership) => membership.status === "active").length,
        eventCount: data.currentEvents.length,
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
        // Per-person totals so the People table can show attendance across groups.
        memberStats: [...byProfile].map(([profileId, stats]) => ({
          profileId,
          present: stats.present,
          expected: stats.expected,
        })),
        isComplete: data.isComplete,
      });
    }

    return { ...groupPage, page: rows };
  },
});

/** Per-member attendance for one group, with one status per completed event. */
export const groupMemberAttendance = query({
  args: { groupId: v.id("groups"), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    const group = await requireDashboardGroup(ctx, access, args.groupId);
    const data = await loadGroupAttendanceWindow(ctx, group._id, attendanceWindow(args));
    const { events, byProfile } = memberAttendanceStats(data);
    const membershipByProfile = new Map<Id<"userProfiles">, Doc<"memberships">>();
    for (const membership of data.memberships) {
      const existing = membershipByProfile.get(membership.profileId);
      if (!existing || membership.joinedAt > existing.joinedAt) {
        membershipByProfile.set(membership.profileId, membership);
      }
    }

    const members = [];
    for (const [profileId, stats] of byProfile) {
      const profile = await ctx.db.get(profileId);
      if (!profile || profile.deletedAt !== undefined) continue;
      const membership = membershipByProfile.get(profileId);
      const status = !membership
        ? ("former" as const)
        : membership.status === "active"
          ? membership.memberClass === "visitor" ? ("visitor" as const) : ("active" as const)
          : membership.status === "inactive"
            ? ("inactive" as const)
            : ("former" as const);
      members.push({
        profileId,
        displayName: getProfileDisplayName(profile) ?? profile.invitedEmail ?? "Unnamed member",
        photoUrl: profile.avatarStorageId ? await ctx.storage.getUrl(profile.avatarStorageId) : null,
        status,
        joinedAt: membership?.joinedAt ?? null,
        ...stats,
        rate: stats.expected === 0 ? null : stats.present / stats.expected,
      });
    }
    members.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.displayName.localeCompare(b.displayName));

    const current = attendanceTotals(data, data.currentEvents);
    return {
      group: { _id: group._id, name: group.name, code: group.code },
      totals: current,
      events: events.map((event) => ({ _id: event._id, title: event.title, startAt: event.startAt })),
      members,
      isComplete: data.isComplete,
    };
  },
});

export const listPendingJoinRequests = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    const limit = Math.min(args.limit ?? 100, 100);
    let requests: Doc<"joinRequests">[];
    if (access.kind === "admin") {
      requests = await ctx.db
        .query("joinRequests")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .take(limit);
    } else {
      requests = [];
      for (const groupId of access.groupIds) {
        if (requests.length >= limit) break;
        requests.push(...await ctx.db
          .query("joinRequests")
          .withIndex("by_group_status", (q) => q.eq("groupId", groupId).eq("status", "pending"))
          .take(limit - requests.length));
      }
    }
    const rows = [];
    for (const request of requests) {
      const profile = await ctx.db.get(request.profileId);
      const group = await ctx.db.get(request.groupId);
      rows.push({ request, profile: profile ? await publicProfile(ctx, profile) : null, group });
    }
    return rows;
  },
});

export const approveJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    const request = await ctx.db.get(args.joinRequestId);
    if (!request || !canAccessGroup(access, request.groupId)) throw new Error("Join request not found");

    return await approvePendingJoinRequest(ctx, args.joinRequestId, {
      reviewedByProfileId: await reviewerProfileId(ctx, access),
    });
  },
});

export const rejectJoinRequest = mutation({
  args: { joinRequestId: v.id("joinRequests"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    const request = await ctx.db.get(args.joinRequestId);
    if (!request || !canAccessGroup(access, request.groupId)) throw new Error("Join request not found");

    return await rejectPendingJoinRequest(ctx, args.joinRequestId, {
      reviewedByProfileId: await reviewerProfileId(ctx, access),
      reason: args.reason,
    });
  },
});

async function resolveGroupRegion(
  ctx: MutationCtx,
  access: DashboardAccess,
  regionId: Id<"regions"> | null | undefined,
) {
  if (access.kind === "regional") {
    if (regionId === undefined || regionId === null) {
      if (access.regions.length === 1) return access.regions[0]._id;
      throw new Error("Choose one of your regions for this group");
    }
    if (!access.regions.some((region) => region._id === regionId)) {
      throw new Error("Choose one of your regions for this group");
    }
    return regionId;
  }
  if (regionId && !(await ctx.db.get(regionId))) throw new Error("Region not found");
  return regionId;
}

export const createGroup = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
    regionId: v.optional(v.union(v.id("regions"), v.null())),
    ...groupDetailsArgs,
  },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Group name is required");
    const regionId = await resolveGroupRegion(ctx, access, args.regionId);

    const now = Date.now();
    const code = normalizeCode(args.code?.trim() || generatedCode(name, now));
    if (code.length !== 6) throw new Error("Group code must be exactly 6 letters/numbers");

    const existing = await ctx.db.query("groups").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (existing) throw new Error("Group code is already in use");

    const groupId = await ctx.db.insert("groups", {
      name,
      code,
      isActive: true,
      ...(regionId ? { regionId } : {}),
      ...groupDetailsPatch(args),
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
    // Omit to keep the current region; null removes it (admins only).
    regionId: v.optional(v.union(v.id("regions"), v.null())),
    ...groupDetailsArgs,
  },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    const group = await requireDashboardGroup(ctx, access, args.groupId);

    const name = args.name.trim();
    const code = normalizeCode(args.code);
    if (!name) throw new Error("Group name is required");
    if (code.length !== 6) throw new Error("Group code must be exactly 6 letters/numbers");

    const existing = await ctx.db.query("groups").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (existing && existing._id !== group._id) throw new Error("Group code is already in use");

    const regionPatch = args.regionId === undefined
      ? {}
      : { regionId: (await resolveGroupRegion(ctx, access, args.regionId)) ?? undefined };
    await ctx.db.patch(group._id, {
      name,
      code,
      isActive: args.isActive,
      ...regionPatch,
      ...groupDetailsPatch(args),
      updatedAt: Date.now(),
    });
    return await ctx.db.get(group._id);
  },
});

export const deleteGroup = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    const group = await requireDashboardGroup(ctx, access, args.groupId);
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

export const setGroupLeader = mutation({
  args: {
    groupId: v.id("groups"),
    profileId: v.union(v.id("userProfiles"), v.null()),
  },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    const group = await requireDashboardGroup(ctx, access, args.groupId);
    const previousLeaderId = group.leaderProfileId;
    if (args.profileId) {
      const profile = await ctx.db.get(args.profileId);
      if (!profile || profile.deletedAt !== undefined) throw new Error("Profile not found");
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
          revokedByKind: assignedByKind(access),
          revokedByUserId: access.userId,
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
    const access = await requireDashboardAccess(ctx);
    const group = await requireDashboardGroup(ctx, access, args.groupId);
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
    const access = await requireDashboardAccess(ctx);
    const profile = await ctx.db.get(args.profileId);
    const group = await requireDashboardGroup(ctx, access, args.groupId);
    if (!profile || profile.deletedAt !== undefined) throw new Error("Profile not found");
    if (!group.isActive) throw new Error("Active group not found");
    await addProfileToGroup(ctx, profile._id, group._id);
    return null;
  },
});

export const removeMembership = mutation({
  args: { profileId: v.id("userProfiles"), groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const access = await requireDashboardAccess(ctx);
    await requireDashboardGroup(ctx, access, args.groupId);
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

/** Deletes an account or an unclaimed invitation while retaining group history. */
export const deleteUser = mutation({
  args: { profileId: v.id("userProfiles") },
  returns: v.null(),
  handler: async (ctx, { profileId }) => {
    const admin = await requireAdmin(ctx);
    const profile = await ctx.db.get(profileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.deletedAt !== undefined) return null;
    if (profile.userId === admin.userId) {
      throw new Error("You cannot delete your own account from the admin dashboard.");
    }
    if (profile.userId) await deleteUserAccount(ctx, profile.userId);
    else await anonymizeProfile(ctx, profile, Date.now());
    return null;
  },
});

import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbCtx = QueryCtx | MutationCtx;
type AuthUser = Doc<"users"> & { email?: string; name?: string };

const MAX_REGIONS_PER_LEADER = 50;
const MAX_GROUPS_PER_REGION = 500;

export type DashboardAccess =
  | {
      kind: "admin";
      userId: Id<"users">;
      user: AuthUser;
      email: string;
      profile: Doc<"userProfiles"> | null;
    }
  | {
      kind: "regional";
      userId: Id<"users">;
      user: AuthUser;
      email: string;
      profile: Doc<"userProfiles">;
      regions: Doc<"regions">[];
      groupIds: Set<Id<"groups">>;
    };

export type DashboardAccessResult =
  | { access: DashboardAccess; reason: null }
  | {
      access: null;
      reason: "notAuthenticated" | "notConfigured" | "notAllowed" | "emailNotVerified";
      user: AuthUser | null;
    };

export function allowedAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function profileForUser(ctx: DbCtx, userId: Id<"users">) {
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  return profile && profile.deletedAt === undefined ? profile : null;
}

/** Regions a profile leads, and every group inside them. */
export async function regionalScopeForProfile(ctx: DbCtx, profileId: Id<"userProfiles">) {
  const assignments = await ctx.db
    .query("regionalLeaderAssignments")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .take(MAX_REGIONS_PER_LEADER);
  const regions: Doc<"regions">[] = [];
  const groupIds = new Set<Id<"groups">>();
  for (const assignment of assignments) {
    const region = await ctx.db.get(assignment.regionId);
    if (!region) continue;
    regions.push(region);
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_region", (q) => q.eq("regionId", region._id))
      .take(MAX_GROUPS_PER_REGION);
    for (const group of groups) groupIds.add(group._id);
  }
  regions.sort((a, b) => a.name.localeCompare(b.name));
  return { regions, groupIds };
}

export async function resolveDashboardAccess(ctx: DbCtx): Promise<DashboardAccessResult> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return { access: null, reason: "notAuthenticated", user: null };
  const user = (await ctx.db.get(userId)) as AuthUser | null;
  const email = user?.email?.trim().toLowerCase() ?? "";
  if (!user || !email) return { access: null, reason: "notAllowed", user };

  const verified = typeof user.emailVerificationTime === "number";
  const allowed = allowedAdminEmails();
  if (allowed.includes(email)) {
    if (!verified) return { access: null, reason: "emailNotVerified", user };
    return {
      access: { kind: "admin", userId, user, email, profile: await profileForUser(ctx, userId) },
      reason: null,
    };
  }

  const profile = await profileForUser(ctx, userId);
  if (profile) {
    const scope = await regionalScopeForProfile(ctx, profile._id);
    if (scope.regions.length > 0) {
      if (!verified) return { access: null, reason: "emailNotVerified", user };
      return {
        access: { kind: "regional", userId, user, email, profile, ...scope },
        reason: null,
      };
    }
  }

  if (allowed.length === 0) return { access: null, reason: "notConfigured", user };
  return { access: null, reason: "notAllowed", user };
}

export async function requireDashboardAccess(ctx: DbCtx): Promise<DashboardAccess> {
  const result = await resolveDashboardAccess(ctx);
  if (result.access) return result.access;
  if (result.reason === "notAuthenticated") throw new Error("Not authenticated");
  if (result.reason === "notConfigured") {
    throw new Error("Admin access is not configured. Set ADMIN_EMAILS in Convex env vars.");
  }
  if (result.reason === "emailNotVerified") {
    throw new Error("Verify your email before accessing admin tools.");
  }
  throw new Error("This account is not allowed to access admin tools.");
}

export async function requireAdmin(ctx: DbCtx) {
  const access = await requireDashboardAccess(ctx);
  if (access.kind !== "admin") throw new Error("Only admins can do this.");
  return access;
}

export function canAccessGroup(access: DashboardAccess, groupId: Id<"groups">) {
  return access.kind === "admin" || access.groupIds.has(groupId);
}

export async function requireDashboardGroup(
  ctx: DbCtx,
  access: DashboardAccess,
  groupId: Id<"groups">,
) {
  const group = await ctx.db.get(groupId);
  if (!group || !canAccessGroup(access, groupId)) throw new Error("Group not found");
  return group;
}

/** Groups this dashboard user can see, newest first. */
export async function accessibleGroups(ctx: DbCtx, access: DashboardAccess, limit: number) {
  if (access.kind === "admin") return await ctx.db.query("groups").order("desc").take(limit);
  const groups: Doc<"groups">[] = [];
  for (const groupId of access.groupIds) {
    const group = await ctx.db.get(groupId);
    if (group) groups.push(group);
  }
  return groups.sort((a, b) => b._creationTime - a._creationTime).slice(0, limit);
}

export function assignedByKind(access: DashboardAccess) {
  return access.kind === "admin" ? ("admin" as const) : ("regionalLeader" as const);
}

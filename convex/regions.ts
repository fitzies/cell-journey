import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getProfileDisplayName } from "./profiles";
import { requireAdmin, requireDashboardAccess } from "./dashboardAccess";

const MAX_REGIONS = 100;

function cleanRegionName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Region name is required");
  if (name.length > 60) throw new Error("Keep the region name under 60 characters");
  return name;
}

/** Regions with their groups and regional leaders. Regional leaders see only their own. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireDashboardAccess(ctx);
    const regions = access.kind === "admin"
      ? await ctx.db.query("regions").withIndex("by_name").take(MAX_REGIONS)
      : access.regions;
    const rows = [];
    for (const region of regions) {
      const groups = await ctx.db
        .query("groups")
        .withIndex("by_region", (q) => q.eq("regionId", region._id))
        .take(500);
      const assignments = await ctx.db
        .query("regionalLeaderAssignments")
        .withIndex("by_region", (q) => q.eq("regionId", region._id))
        .take(50);
      const leaders = [];
      for (const assignment of assignments) {
        const profile = await ctx.db.get(assignment.profileId);
        if (!profile || profile.deletedAt !== undefined) continue;
        leaders.push({
          assignmentId: assignment._id,
          profileId: profile._id,
          displayName: getProfileDisplayName(profile) ?? profile.invitedEmail ?? "Unnamed",
          photoUrl: profile.avatarStorageId ? await ctx.storage.getUrl(profile.avatarStorageId) : null,
        });
      }
      rows.push({
        region,
        groups: groups
          .map((group) => ({ _id: group._id, name: group.name, isActive: group.isActive }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        leaders,
      });
    }
    return rows;
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = cleanRegionName(args.name);
    const existing = await ctx.db.query("regions").withIndex("by_name", (q) => q.eq("name", name)).first();
    if (existing) throw new Error("A region with this name already exists");
    const now = Date.now();
    return await ctx.db.insert("regions", { name, createdAt: now, updatedAt: now });
  },
});

export const rename = mutation({
  args: { regionId: v.id("regions"), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const region = await ctx.db.get(args.regionId);
    if (!region) throw new Error("Region not found");
    const name = cleanRegionName(args.name);
    const existing = await ctx.db.query("regions").withIndex("by_name", (q) => q.eq("name", name)).first();
    if (existing && existing._id !== region._id) throw new Error("A region with this name already exists");
    await ctx.db.patch(region._id, { name, updatedAt: Date.now() });
    return null;
  },
});

/** Deletes a region, leaving its groups without a region. */
export const remove = mutation({
  args: { regionId: v.id("regions") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const region = await ctx.db.get(args.regionId);
    if (!region) return null;
    const groups = await ctx.db
      .query("groups")
      .withIndex("by_region", (q) => q.eq("regionId", region._id))
      .take(500);
    for (const group of groups) await ctx.db.patch(group._id, { regionId: undefined, updatedAt: Date.now() });
    const assignments = await ctx.db
      .query("regionalLeaderAssignments")
      .withIndex("by_region", (q) => q.eq("regionId", region._id))
      .take(100);
    for (const assignment of assignments) await ctx.db.delete(assignment._id);
    await ctx.db.delete(region._id);
    return null;
  },
});

export const setGroupRegion = mutation({
  args: { groupId: v.id("groups"), regionId: v.union(v.id("regions"), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");
    if (args.regionId && !(await ctx.db.get(args.regionId))) throw new Error("Region not found");
    await ctx.db.patch(group._id, { regionId: args.regionId ?? undefined, updatedAt: Date.now() });
    return null;
  },
});

export const assignLeader = mutation({
  args: { regionId: v.id("regions"), profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const region = await ctx.db.get(args.regionId);
    if (!region) throw new Error("Region not found");
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.deletedAt !== undefined) throw new Error("Profile not found");
    const existing = await ctx.db
      .query("regionalLeaderAssignments")
      .withIndex("by_profile_and_region", (q) => q.eq("profileId", profile._id).eq("regionId", region._id))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("regionalLeaderAssignments", {
      regionId: region._id,
      profileId: profile._id,
      assignedAt: Date.now(),
      assignedByUserId: admin.userId,
    });
  },
});

export const removeLeader = mutation({
  args: { assignmentId: v.id("regionalLeaderAssignments") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (await ctx.db.get(args.assignmentId)) await ctx.db.delete(args.assignmentId);
    return null;
  },
});

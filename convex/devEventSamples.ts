import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { DEV_TEST_GROUP_CODE, DEV_TEST_GROUP_NAME } from "./devAccountProvisioning";
import { isMembershipActiveAtFromRows, loadGroupMembershipActivity } from "./membershipActivity";

const SAMPLE_MARKER = "Cell Journey event status samples v1";
const HOUR = 60 * 60 * 1000;

/** Additive, repeat-safe sample data for the reserved development group only. */
export const populate = internalMutation({
  args: { dryRun: v.boolean() },
  handler: async (ctx, { dryRun }) => {
    if (process.env.AUTH_DEV_LOGIN_ENABLED !== "true") {
      throw new Error("Sample events require the development login environment");
    }
    const group = await ctx.db.query("groups")
      .withIndex("by_code", (q) => q.eq("code", DEV_TEST_GROUP_CODE)).unique();
    if (!group || group.name !== DEV_TEST_GROUP_NAME || !group.leaderProfileId) {
      throw new Error("The reserved development group and its leader must already exist");
    }
    const leader = await ctx.db.get(group.leaderProfileId);
    if (!leader) throw new Error("Development group leader not found");
    const activity = await loadGroupMembershipActivity(ctx, group._id);
    const existing = await ctx.db.query("events")
      .withIndex("by_group_start", (q) => q.eq("groupId", group._id)).take(501);
    if (existing.length > 500) throw new Error("Review this group's samples manually before adding more");
    const now = Date.now();
    const specs = [
      { title: "[Sample] Prayer evening", hours: -36, marked: "none", venue: "Room 02-03" },
      { title: "[Sample] Bible study", hours: -24, marked: "partial", venue: "Fellowship room" },
      { title: "[Sample] Sunday sharing", hours: -12, marked: "all", venue: "Room 01-02" },
      { title: "[Sample] Worship and fellowship", hours: -6, marked: "all", venue: "Fellowship room" },
      { title: "[Sample] Gathering in progress", hours: -0.25, marked: "one", venue: "Room 02-03" },
      { title: "[Sample] Friday cell gathering", hours: 72, marked: "none", venue: "Fellowship room" },
      { title: "[Sample] Group lunch", hours: 168, marked: "none", venue: "Community hall" },
    ] as const;
    const result = [];
    for (const spec of specs) {
      const previous = existing.find((event) =>
        event.title.replace(/^\[Sample\] /, "") === spec.title.replace(/^\[Sample\] /, "") && event.remarks === SAMPLE_MARKER);
      if (previous) {
        result.push({ title: spec.title, eventId: previous._id, skipped: true });
        continue;
      }
      const startAt = now + spec.hours * HOUR;
      const eligible = activity.memberships.filter((membership) =>
        isMembershipActiveAtFromRows(membership, activity.periodsByMembership.get(membership._id) ?? [], startAt));
      const byProfile = new Map(eligible.sort((a, b) => a.joinedAt - b.joinedAt).map((m) => [m.profileId, m]));
      const roster = [...byProfile.values()].sort((a, b) => Number(a.memberClass === "visitor") - Number(b.memberClass === "visitor") || a.joinedAt - b.joinedAt);
      for (const membership of roster) {
        if (!await ctx.db.get(membership.profileId)) throw new Error("Sample roster contains a missing profile");
      }
      if (spec.hours < 0 && roster.length < 2) {
        throw new Error("Sample events need at least two eligible existing members; membership history will not be changed");
      }
      const markedCount = spec.marked === "all" ? roster.length
        : spec.marked === "partial" ? roster.length - 1 : spec.marked === "one" ? 1 : 0;
      const eventId = dryRun ? null : await ctx.db.insert("events", {
        groupId: group._id, title: spec.title, venue: spec.venue, remarks: SAMPLE_MARKER,
        startAt, endAt: startAt + 2 * HOUR, createdByProfileId: leader._id, createdAt: now, updatedAt: now,
      });
      if (eventId) {
        for (const [index, membership] of roster.slice(0, markedCount).entries()) {
          await ctx.db.insert("attendance", {
            eventId, groupId: group._id, profileId: membership.profileId, membershipId: membership._id,
            finalStatus: index % 3 === 1 ? "absent" : "present",
            finalizedAt: now, finalizedByProfileId: leader._id, finalizationNote: SAMPLE_MARKER,
            createdAt: now, updatedAt: now,
          });
        }
      }
      result.push({ title: spec.title, eventId, skipped: false, startAt, requiredCount: roster.length, markedCount });
    }
    return { groupId: group._id, dryRun, events: result };
  },
});

export const removeTitlePrefixes = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.AUTH_DEV_LOGIN_ENABLED !== "true") {
      throw new Error("Development sample maintenance is disabled");
    }
    const group = await ctx.db.query("groups")
      .withIndex("by_code", (q) => q.eq("code", DEV_TEST_GROUP_CODE)).unique();
    if (!group || group.name !== DEV_TEST_GROUP_NAME) throw new Error("Development group not found");
    const events = await ctx.db.query("events")
      .withIndex("by_group_start", (q) => q.eq("groupId", group._id)).take(501);
    if (events.length > 500) throw new Error("Review the group manually before changing titles");
    const updated = [];
    for (const event of events) {
      if (event.remarks !== SAMPLE_MARKER || !event.title.startsWith("[Sample] ")) continue;
      const title = event.title.replace(/^\[Sample\] /, "");
      await ctx.db.patch(event._id, { title, updatedAt: Date.now() });
      updated.push({ eventId: event._id, title });
    }
    return updated;
  },
});

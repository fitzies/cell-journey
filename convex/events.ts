import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCurrentProfile, requireLeaderProfile } from "./profiles";

export const listMine = query({
  args: { from: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireCurrentProfile(ctx);
    const groupId = profile.role === "leader" ? profile.leaderGroupId : profile.currentGroupId;
    if (!groupId) return [];

    const from = args.from ?? 0;
    const limit = Math.min(args.limit ?? 50, 100);
    const events = [];
    for await (const event of ctx.db
      .query("events")
      .withIndex("by_group_start", (q) => q.eq("groupId", groupId).gte("startAt", from))
      .order("asc")) {
      if (!event.cancelledAt) events.push(event);
      if (events.length >= limit) break;
    }
    return events;
  },
});

const eventFields = {
  title: v.string(),
  // `location` keeps older app versions compatible during the venue migration.
  location: v.optional(v.string()),
  venue: v.optional(v.string()),
  word: v.optional(v.string()),
  worship: v.optional(v.string()),
  remarks: v.optional(v.string()),
  startAt: v.number(),
  endAt: v.number(),
};

const importEventValidator = v.object({
  sourceRow: v.number(),
  title: v.string(),
  venue: v.string(),
  word: v.string(),
  worship: v.string(),
  remarks: v.string(),
  startAt: v.number(),
  endAt: v.number(),
});

type EventFields = {
  title: string;
  location?: string;
  venue?: string;
  word?: string;
  worship?: string;
  remarks?: string;
  startAt: number;
  endAt: number;
};

type NormalizedEvent = {
  title: string;
  venue?: string;
  word?: string;
  worship?: string;
  remarks?: string;
  startAt: number;
  endAt: number;
};

function optionalText(value: string | undefined, maxLength: number, label: string) {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return trimmed || undefined;
}

function normalizeEvent(args: EventFields): NormalizedEvent {
  const title = args.title.trim();
  if (!title) throw new Error("Title is required");
  if (title.length > 120) throw new Error("Title must be 120 characters or fewer");
  if (!Number.isFinite(args.startAt) || !Number.isFinite(args.endAt)) throw new Error("Event times are invalid");
  if (args.endAt <= args.startAt) throw new Error("End time must be after start time");

  return {
    title,
    venue: optionalText(args.venue ?? args.location, 200, "Venue"),
    word: optionalText(args.word, 200, "Word"),
    worship: optionalText(args.worship, 200, "Worship"),
    remarks: optionalText(args.remarks, 1000, "Remarks"),
    startAt: args.startAt,
    endAt: args.endAt,
  };
}

function eventDocumentFields(event: NormalizedEvent) {
  return {
    title: event.title,
    // Dual-write until app versions that require `location` are retired.
    location: event.venue ?? "",
    ...(event.venue ? { venue: event.venue } : {}),
    ...(event.word ? { word: event.word } : {}),
    ...(event.worship ? { worship: event.worship } : {}),
    ...(event.remarks ? { remarks: event.remarks } : {}),
    startAt: event.startAt,
    endAt: event.endAt,
  };
}

async function insertEvent(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  profileId: Id<"userProfiles">,
  args: EventFields,
) {
  const event = normalizeEvent(args);
  const now = Date.now();
  const eventId = await ctx.db.insert("events", {
    groupId,
    ...eventDocumentFields(event),
    createdByProfileId: profileId,
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(eventId);
}

export const create = mutation({
  args: eventFields,
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    return await insertEvent(ctx, leader.leaderGroupId!, leader._id, args);
  },
});

export const importMine = mutation({
  args: {
    sourceType: v.union(v.literal("csv"), v.literal("xlsx")),
    fileName: v.string(),
    events: v.array(importEventValidator),
  },
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    const groupId = leader.leaderGroupId!;
    if (args.events.length === 0) throw new Error("The import has no events");
    if (args.events.length > 100) throw new Error("Import up to 100 events at a time");

    const fileName = args.fileName.trim();
    if (!fileName || fileName.length > 200) throw new Error("The import file name is invalid");

    const normalized = args.events.map((event) => ({
      sourceRow: event.sourceRow,
      event: normalizeEvent(event),
    }));
    const seen = new Set<string>();

    for (const row of normalized) {
      const key = `${row.event.startAt}:${row.event.title.toLowerCase()}`;
      if (seen.has(key)) throw new Error(`Row ${row.sourceRow} duplicates another row in this file`);
      seen.add(key);

      const matches = await ctx.db
        .query("events")
        .withIndex("by_group_start", (q) =>
          q.eq("groupId", groupId).eq("startAt", row.event.startAt),
        )
        .take(200);
      const duplicate = matches.some((event) =>
        !event.cancelledAt && event.title.trim().toLowerCase() === row.event.title.toLowerCase(),
      );
      if (duplicate) throw new Error(`Row ${row.sourceRow} matches an event already in the schedule`);
    }

    const now = Date.now();
    for (const row of normalized) {
      await ctx.db.insert("events", {
        groupId,
        ...eventDocumentFields(row.event),
        createdByProfileId: leader._id,
        importSource: args.sourceType,
        importFileName: fileName,
        importedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { insertedCount: normalized.length };
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    ...eventFields,
  },
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.groupId !== leader.leaderGroupId) throw new Error("Event not found");
    if (event.cancelledAt) throw new Error("Cancelled events cannot be edited");

    const normalized = normalizeEvent(args);
    await ctx.db.patch(event._id, {
      ...eventDocumentFields(normalized),
      // Keep older deployed clients working during the venue migration.
      location: normalized.venue ?? "",
      venue: normalized.venue,
      word: normalized.word,
      worship: normalized.worship,
      remarks: normalized.remarks,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(event._id);
  },
});

export const cancel = mutation({
  args: { eventId: v.id("events"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const leader = await requireLeaderProfile(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.groupId !== leader.leaderGroupId) throw new Error("Event not found");
    const now = Date.now();
    await ctx.db.patch(event._id, {
      cancelledAt: now,
      cancelledByProfileId: leader._id,
      cancellationReason: args.reason,
      updatedAt: now,
    });
    return null;
  },
});

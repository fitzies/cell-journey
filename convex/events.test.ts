/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeTest() {
  return convexTest(schema, modules);
}

type TestClient = ReturnType<typeof makeTest>;

async function seedLeaderAndGroup(t: TestClient) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { name: "Leader" });
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      role: "leader",
      onboardingStatus: "approved",
      fullName: "Leader",
      singaporeRegion: "central",
      serviceIds: [],
      createdAt: now,
      updatedAt: now,
    });
    const groupId = await ctx.db.insert("groups", {
      name: "Import Group",
      code: "IMPORT",
      leaderProfileId: profileId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    return { userId, profileId, groupId };
  });
}

function asUser(t: TestClient, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

function importRow(sourceRow: number, title: string, startAt: number) {
  return {
    sourceRow,
    title,
    venue: "Home",
    word: "Alice",
    worship: "Bob",
    remarks: "Bring snacks",
    startAt,
    endAt: startAt + 2 * 60 * 60 * 1000,
  };
}

describe("event spreadsheet imports", () => {
  test("imports a validated batch with the new event fields", async () => {
    const t = makeTest();
    const seeded = await seedLeaderAndGroup(t);
    const startAt = Date.UTC(2026, 6, 18, 6, 0);

    const result = await asUser(t, seeded.userId).mutation(api.events.importForGroup, {
      groupId: seeded.groupId,
      sourceType: "xlsx",
      fileName: "events.xlsx",
      events: [
        importRow(2, "Cell Group", startAt),
        { ...importRow(3, "Prayer Altar", startAt + 7 * 24 * 60 * 60 * 1000), venue: "", word: "", worship: "", remarks: "" },
      ],
    });

    expect(result).toEqual({ insertedCount: 2 });
    const events = await asUser(t, seeded.userId).query(api.events.listForGroup, {
      groupId: seeded.groupId,
      from: 0,
      limit: 10,
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: "Cell Group",
      venue: "Home",
      word: "Alice",
      worship: "Bob",
      remarks: "Bring snacks",
      importSource: "xlsx",
      importFileName: "events.xlsx",
    });
    expect(events[1].venue).toBeUndefined();
  });

  test("rejects the whole batch when an event already exists", async () => {
    const t = makeTest();
    const seeded = await seedLeaderAndGroup(t);
    const client = asUser(t, seeded.userId);
    const startAt = Date.UTC(2026, 7, 1, 6, 30);

    await client.mutation(api.events.createForGroup, {
      groupId: seeded.groupId,
      title: "Cell Group",
      venue: "Home",
      startAt,
      endAt: startAt + 2 * 60 * 60 * 1000,
    });

    await expect(client.mutation(api.events.importForGroup, {
      groupId: seeded.groupId,
      sourceType: "csv",
      fileName: "events.csv",
      events: [
        importRow(2, "Unique Event", startAt + 24 * 60 * 60 * 1000),
        importRow(3, "Cell Group", startAt),
      ],
    })).rejects.toThrow("matches an event already in the schedule");

    const events = await client.query(api.events.listForGroup, {
      groupId: seeded.groupId,
      from: 0,
      limit: 10,
    });
    expect(events.map((event) => event.title)).toEqual(["Cell Group"]);
  });

  test("rejects imports from a leader who does not own the group", async () => {
    const t = makeTest();
    const owner = await seedLeaderAndGroup(t);
    const otherLeader = await seedLeaderAndGroup(t);
    const startAt = Date.UTC(2026, 8, 5, 6, 30);

    await expect(asUser(t, otherLeader.userId).mutation(api.events.importForGroup, {
      groupId: owner.groupId,
      sourceType: "xlsx",
      fileName: "events.xlsx",
      events: [importRow(2, "Cell Group", startAt)],
    })).rejects.toThrow("Unauthorized");
  });
});

describe("leader event editing", () => {
  test("loads only editable events and handles stale or malformed links", async () => {
    const t = makeTest();
    const owner = await seedLeaderAndGroup(t);
    const other = await seedLeaderAndGroup(t);
    const client = asUser(t, owner.userId);
    const event = await client.mutation(api.events.createForGroup, {
      groupId: owner.groupId, title: "Gathering", startAt: 1000, endAt: 2000,
    });
    expect(await client.query(api.events.getForEditing, { eventId: event!._id })).toEqual(event);
    expect(await asUser(t, other.userId).query(api.events.getForEditing, { eventId: event!._id })).toBeNull();
    expect(await client.query(api.events.getForEditing, { eventId: "invalid" })).toBeNull();
    await client.mutation(api.events.cancel, { eventId: event!._id });
    expect(await client.query(api.events.getForEditing, { eventId: event!._id })).toBeNull();
    await expect(client.mutation(api.events.update, {
      eventId: event!._id, title: "Edited", startAt: 1000, endAt: 2000,
    })).rejects.toThrow("Cancelled events cannot be edited");
    expect(await client.query(api.events.listForGroup, { groupId: owner.groupId })).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(event!._id))).toMatchObject({ title: "Gathering", cancelledByProfileId: owner.profileId });
  });

  test("updates a past event in place, clears optional fields, and preserves ownership", async () => {
    const t = makeTest();
    const owner = await seedLeaderAndGroup(t);
    const client = asUser(t, owner.userId);
    const event = await client.mutation(api.events.createForGroup, {
      groupId: owner.groupId, title: "Gathering", venue: "Home", word: "Alice",
      worship: "Bob", remarks: "Bring snacks", startAt: 1000, endAt: 2000,
    });
    const edited = await client.mutation(api.events.update, {
      eventId: event!._id, title: " Prayer night ", venue: "", word: "", worship: "", remarks: "",
      startAt: 3000, endAt: 4000,
    });
    expect(edited).toMatchObject({
      _id: event!._id, groupId: owner.groupId, createdByProfileId: owner.profileId,
      createdAt: event!.createdAt, title: "Prayer night", location: "", startAt: 3000, endAt: 4000,
    });
    for (const field of ['venue', 'word', 'worship', 'remarks'] as const) expect(edited![field]).toBeUndefined();
    expect(await client.query(api.events.listForGroup, { groupId: owner.groupId })).toHaveLength(1);
  });
});

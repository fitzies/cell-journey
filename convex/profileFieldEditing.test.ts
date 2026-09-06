import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  makeTest,
  resetBackendTestState,
  seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

async function seedService(t: ReturnType<typeof makeTest>, isActive = true) {
  return await t.run((ctx) => ctx.db.insert("services", {
    name: "Sunday",
    sortOrder: 0,
    isActive,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

describe("individual profile edits", () => {
  test("successive edits preserve the latest unrelated fields and another account", async () => {
    const t = makeTest();
    const originalServiceId = await seedService(t);
    const newServiceId = await seedService(t);
    const owner = await seedProfile(t, "Original", { structured: true, serviceId: originalServiceId });
    const other = await seedProfile(t, "Other", { structured: true, serviceId: originalServiceId });
    await t.run((ctx) => ctx.db.patch(owner.profileId, { preferredName: "Oli", updatedAt: 1 }));
    const before = await t.run((ctx) => ctx.db.get(owner.profileId));
    const otherBefore = await t.run((ctx) => ctx.db.get(other.profileId));
    const client = asUser(t, owner.userId);

    const named = await client.mutation(api.profiles.updateProfileField, {
      change: { field: "name", firstName: "  Oliver  ", lastName: "  Tan  " },
    });
    expect(named).toEqual({
      ...before,
      firstName: "Oliver",
      lastName: "Tan",
      fullName: "Oliver Tan",
      updatedAt: expect.any(Number),
    });
    expect(named!.updatedAt).toBeGreaterThan(1);

    const serviced = await client.mutation(api.profiles.updateProfileField, {
      change: { field: "services", serviceIds: [newServiceId, newServiceId] },
    });
    expect(serviced).toEqual({ ...named, serviceIds: [newServiceId], updatedAt: expect.any(Number) });

    const located = await client.mutation(api.profiles.updateProfileField, {
      change: { field: "postal", postalSector: "52" },
    });
    const { singaporeRegion: _legacyLocation, ...withoutLegacyLocation } = serviced!;
    expect(located).toEqual({
      ...withoutLegacyLocation,
      postalDistrict: "D18",
      updatedAt: expect.any(Number),
    });
    expect(located).not.toHaveProperty("postalSector");
    expect(await t.run((ctx) => ctx.db.get(other.profileId))).toEqual(otherBefore);
  });

  test.each(["name", "services"] as const)("legacy profiles can repair %s first", async (firstField) => {
    const t = makeTest();
    const serviceId = await seedService(t);
    const owner = await seedProfile(t, "Legacy Display Name");
    const client = asUser(t, owner.userId);
    const changes = {
      name: { field: "name" as const, firstName: "Given", lastName: "Family" },
      services: { field: "services" as const, serviceIds: [serviceId] },
    };
    const first = await client.mutation(api.profiles.updateProfileField, { change: changes[firstField] });
    if (firstField === "services") {
      expect(first).toMatchObject({ fullName: "Legacy Display Name", serviceIds: [serviceId] });
      expect(first?.firstName).toBeUndefined();
      expect(first?.lastName).toBeUndefined();
    } else {
      expect(first).toMatchObject({ firstName: "Given", lastName: "Family", serviceIds: [], onboardingStatus: "profileIncomplete" });
    }
    const secondField = firstField === "name" ? "services" : "name";
    const repaired = await client.mutation(api.profiles.updateProfileField, { change: changes[secondField] });
    expect(repaired).toMatchObject({ firstName: "Given", lastName: "Family", fullName: "Given Family", serviceIds: [serviceId] });
    expect((await client.query(api.profiles.currentContext, {})).profileComplete).toBe(true);
  });

  test("postal edits allow incomplete unrelated details without guessing names", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Legacy Name");
    const updated = await asUser(t, owner.userId).mutation(api.profiles.updateProfileField, {
      change: { field: "postal", postalSector: "01" },
    });
    expect(updated).toMatchObject({ fullName: "Legacy Name", serviceIds: [], postalDistrict: "D01", onboardingStatus: "profileIncomplete" });
    expect(updated?.firstName).toBeUndefined();
    expect(updated?.lastName).toBeUndefined();
    expect(updated?.singaporeRegion).toBeUndefined();
  });

  test.each([
    { field: "name" as const, firstName: " ", lastName: "Tan" },
    { field: "name" as const, firstName: "Sarah", lastName: " " },
    { field: "name" as const, firstName: "", lastName: "" },
    { field: "postal" as const, postalSector: "74" },
    { field: "postal" as const, postalSector: "5" },
    { field: "postal" as const, postalSector: "ab" },
    { field: "postal" as const, postalSector: "520123" },
  ])("rejects invalid $field input without changing the profile", async (change) => {
    const t = makeTest();
    const owner = await seedProfile(t, "Original");
    const before = await t.run((ctx) => ctx.db.get(owner.profileId));
    await expect(asUser(t, owner.userId).mutation(api.profiles.updateProfileField, { change })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(owner.profileId))).toEqual(before);
  });

  test("rejects empty, inactive and missing services atomically", async () => {
    const t = makeTest();
    const activeId = await seedService(t);
    const inactiveId = await seedService(t, false);
    const missingId = await seedService(t);
    await t.run((ctx) => ctx.db.delete(missingId));
    const owner = await seedProfile(t, "Original", { serviceId: activeId });
    const before = await t.run((ctx) => ctx.db.get(owner.profileId));
    const client = asUser(t, owner.userId);
    for (const serviceIds of [[], [inactiveId], [activeId, missingId]]) {
      await expect(client.mutation(api.profiles.updateProfileField, {
        change: { field: "services", serviceIds },
      })).rejects.toThrow();
      expect(await t.run((ctx) => ctx.db.get(owner.profileId))).toEqual(before);
    }
  });

  test("requires authentication and a profile for the authenticated account", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const before = await t.run((ctx) => ctx.db.get(owner.profileId));
    const change = { field: "name" as const, firstName: "Changed", lastName: "Name" };
    await expect(t.mutation(api.profiles.updateProfileField, { change })).rejects.toThrow("Not authenticated");
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "No profile" }));
    await expect(asUser(t, userId).mutation(api.profiles.updateProfileField, { change })).rejects.toThrow("Profile not found");
    expect(await t.run((ctx) => ctx.db.get(owner.profileId))).toEqual(before);
  });
});

/// <reference types="vite/client" />
import { getPostalDistrictFromSector } from "@cell-journey/domain";
import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  makeTest,
  resetBackendTestState,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

describe("Singapore postal districts", () => {
  test.each([
    ["01", "D01", "Raffles Place, Cecil, Marina, People's Park"],
    ["09", "D04", "Telok Blangah, HarbourFront"],
    ["30", "D11", "Watten Estate, Novena, Thomson"],
    ["52", "D18", "Tampines, Pasir Ris"],
    ["73", "D25", "Kranji, Woodlands"],
    ["75", "D27", "Yishun, Sembawang"],
    ["77", "D26", "Upper Thomson, Springleaf"],
    ["81", "D17", "Loyang, Changi"],
    ["82", "D19", "Serangoon Garden, Hougang, Punggol"],
  ])("maps sector %s to %s", (sector, code, area) => {
    expect(getPostalDistrictFromSector(sector)).toMatchObject({ code, area });
  });

  test.each(["", "0", "000", "5a", "74", "83", "99"])(
    "rejects unmapped sector %s",
    (sector) => {
      expect(getPostalDistrictFromSector(sector)).toBeNull();
    },
  );

  test("onboarding derives and stores only the postal district", async () => {
    const t = makeTest();
    const serviceId = await t.run((ctx) =>
      ctx.db.insert("services", {
        name: "Sunday",
        sortOrder: 0,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Postal User" }));
    const client = asUser(t, userId);
    await client.mutation(api.profiles.getOrCreateCurrent, {});

    const updated = await client.mutation(api.profiles.updateOnboardingProfileV3, {
      firstName: "Postal",
      lastName: "User",
      postalSector: "52",
      serviceIds: [serviceId],
    });

    expect(updated).toMatchObject({
      postalDistrict: "D18",
      onboardingStatus: "needsGroup",
    });
    expect(updated?.singaporeRegion).toBeUndefined();
    expect("postalSector" in (updated ?? {})).toBe(false);
    expect(
      (await client.query(api.profiles.currentContext, {})).profileComplete,
    ).toBe(true);
  });

  test("the backend rejects invalid sectors and preserves legacy locations when omitted", async () => {
    const t = makeTest();
    const serviceId = await t.run((ctx) =>
      ctx.db.insert("services", {
        name: "Sunday",
        sortOrder: 0,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const now = Date.now();
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Legacy User" }));
    await t.run((ctx) =>
      ctx.db.insert("userProfiles", {
        userId,
        role: "member",
        onboardingStatus: "approved",
        firstName: "Legacy",
        lastName: "User",
        fullName: "Legacy User",
        singaporeRegion: "central",
        serviceIds: [serviceId],
        createdAt: now,
        updatedAt: now,
      }),
    );
    const client = asUser(t, userId);

    await expect(
      client.mutation(api.profiles.updateProfileV3, {
        firstName: "Legacy",
        lastName: "User",
        postalSector: "74",
        serviceIds: [serviceId],
      }),
    ).rejects.toThrow("valid two-digit postal sector");

    const preserved = await client.mutation(api.profiles.updateProfileV3, {
      firstName: "Legacy",
      lastName: "User",
      serviceIds: [serviceId],
    });
    expect(preserved).toMatchObject({ singaporeRegion: "central" });

    const migrated = await client.mutation(api.profiles.updateProfileV3, {
      firstName: "Legacy",
      lastName: "User",
      postalSector: "56",
      serviceIds: [serviceId],
    });
    expect(migrated).toMatchObject({ postalDistrict: "D20" });
    expect(migrated?.singaporeRegion).toBeUndefined();
  });
});

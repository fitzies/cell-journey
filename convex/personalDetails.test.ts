import {
  formatDateOfBirth,
  formatSingaporePhone,
  normalizeDateOfBirth,
  normalizeSingaporePhone,
} from "@cell-journey/domain";
import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  makeTest,
  resetBackendTestState,
  seedAdmin,
  seedGroup,
  seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

describe("domain helpers", () => {
  test("Singapore phone numbers normalize to +65 and format with a space", () => {
    expect(normalizeSingaporePhone("91234567")).toBe("+6591234567");
    expect(normalizeSingaporePhone("9123 4567")).toBe("+6591234567");
    expect(normalizeSingaporePhone("+65 9123-4567")).toBe("+6591234567");
    expect(normalizeSingaporePhone("6591234567")).toBe("+6591234567");
    expect(normalizeSingaporePhone("(+65) 6123 4567")).toBe("+6561234567");
    expect(normalizeSingaporePhone("31234567")).toBe("+6531234567");
    expect(normalizeSingaporePhone("81234567")).toBe("+6581234567");
    for (const bad of ["12345678", "71234567", "9123456", "912345678", "+44 7911 123456", "abcdefgh", ""]) {
      expect(normalizeSingaporePhone(bad)).toBeNull();
    }
    expect(formatSingaporePhone("+6591234567")).toBe("+65 9123 4567");
    expect(formatSingaporePhone("odd")).toBe("odd");
    expect(formatSingaporePhone(null)).toBeNull();
  });

  test("dates of birth must be real past days after 1900", () => {
    const now = Date.UTC(2026, 10, 11);
    expect(normalizeDateOfBirth("1995-04-12", now)).toBe("1995-04-12");
    expect(normalizeDateOfBirth(" 2000-02-29 ", now)).toBe("2000-02-29");
    expect(normalizeDateOfBirth("2026-11-11", now)).toBe("2026-11-11");
    for (const bad of ["2026-11-12", "1899-12-31", "2001-02-29", "1995-13-01", "1995-4-12", "12/04/1995", ""]) {
      expect(normalizeDateOfBirth(bad, now)).toBeNull();
    }
    expect(formatDateOfBirth("1995-04-02")).toBe("2 Apr 1995");
    expect(formatDateOfBirth(undefined)).toBeNull();
  });
});

describe("profile personal details", () => {
  test("updateProfileField sets and clears each detail", async () => {
    const t = makeTest();
    const person = await seedProfile(t, "Person");
    const client = asUser(t, person.userId);

    await client.mutation(api.profiles.updateProfileField, {
      change: { field: "dateOfBirth", dateOfBirth: "1990-01-31" },
    });
    await client.mutation(api.profiles.updateProfileField, { change: { field: "sex", sex: "male" } });
    const updated = await client.mutation(api.profiles.updateProfileField, {
      change: { field: "phone", phone: "8123 4567" },
    });
    expect(updated).toMatchObject({ dateOfBirth: "1990-01-31", sex: "male", phone: "+6581234567" });
    // Unrelated relationship state is preserved.
    expect(updated?.onboardingStatus).toBe("profileIncomplete");

    await client.mutation(api.profiles.updateProfileField, { change: { field: "dateOfBirth", dateOfBirth: null } });
    await client.mutation(api.profiles.updateProfileField, { change: { field: "sex", sex: null } });
    const cleared = await client.mutation(api.profiles.updateProfileField, { change: { field: "phone", phone: "" } });
    expect(cleared?.dateOfBirth).toBeUndefined();
    expect(cleared?.sex).toBeUndefined();
    expect(cleared?.phone).toBeUndefined();

    await expect(
      client.mutation(api.profiles.updateProfileField, { change: { field: "phone", phone: "+1 555 0100" } }),
    ).rejects.toThrow("Singapore phone");
    await expect(
      client.mutation(api.profiles.updateProfileField, { change: { field: "dateOfBirth", dateOfBirth: "2999-01-01" } }),
    ).rejects.toThrow("date of birth");
  });

  test("updatePersonalDetails saves several fields and leaves omitted ones alone", async () => {
    const t = makeTest();
    const person = await seedProfile(t, "Person");
    const client = asUser(t, person.userId);
    await client.mutation(api.profiles.updatePersonalDetails, {
      dateOfBirth: "1988-08-08",
      sex: "female",
      phone: "61234567",
    });
    const partial = await client.mutation(api.profiles.updatePersonalDetails, { phone: null });
    expect(partial).toMatchObject({ dateOfBirth: "1988-08-08", sex: "female" });
    expect(partial?.phone).toBeUndefined();
    await expect(
      client.mutation(api.profiles.updatePersonalDetails, { dateOfBirth: "1988-02-30" }),
    ).rejects.toThrow("date of birth");
  });

  test("leaders and admins see personal details", async () => {
    const t = makeTest();
    const admin = await seedAdmin(t);
    const owner = await seedProfile(t, "Owner");
    const member = await seedProfile(t, "Member");
    const groupId = await seedGroup(t, owner.profileId, "DETAIL");
    const membershipId = await t.run((ctx) =>
      ctx.db.insert("memberships", {
        profileId: member.profileId,
        groupId,
        status: "active",
        joinedAt: Date.now(),
      }),
    );
    await asUser(t, member.userId).mutation(api.profiles.updatePersonalDetails, {
      dateOfBirth: "2001-05-06",
      sex: "male",
      phone: "91234567",
    });

    const view = await asUser(t, owner.userId).query(api.groups.getMemberProfile, { groupId, membershipId });
    expect(view?.profile).toMatchObject({ dateOfBirth: "2001-05-06", sex: "male", phone: "+6591234567" });

    const rows = await asUser(t, admin.userId).query(api.admin.listUsers, { search: "member" });
    expect(rows[0].profile).toMatchObject({ dateOfBirth: "2001-05-06", sex: "male", phone: "+6591234567" });
  });
});

describe("group details", () => {
  test("owners edit details; co-leaders and members cannot", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const coLeader = await seedProfile(t, "Co");
    const groupId = await seedGroup(t, owner.profileId, "GDETAIL");
    await t.run((ctx) =>
      ctx.db.insert("coLeaderAssignments", {
        groupId,
        profileId: coLeader.profileId,
        status: "active",
        assignedAt: Date.now(),
        assignedByKind: "developer",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const ownerClient = asUser(t, owner.userId);

    const updated = await ownerClient.mutation(api.groups.updateGroupDetails, {
      groupId,
      languages: ["english", "mandarin", "english"],
      frequency: "weekly",
      demographic: "couples",
      location: "  Tampines   Central  ",
    });
    expect(updated).toMatchObject({
      languages: ["english", "mandarin"],
      frequency: "weekly",
      demographic: "couples",
      location: "Tampines Central",
    });

    // Omitted fields stay; null and empty values clear.
    const partial = await ownerClient.mutation(api.groups.updateGroupDetails, {
      groupId,
      frequency: null,
      languages: [],
      location: "",
    });
    expect(partial).toMatchObject({ demographic: "couples" });
    expect(partial?.frequency).toBeUndefined();
    expect(partial?.languages).toBeUndefined();
    expect(partial?.location).toBeUndefined();

    await expect(
      ownerClient.mutation(api.groups.updateGroupDetails, { groupId, location: "x".repeat(81) }),
    ).rejects.toThrow("under 80");
    await expect(
      asUser(t, coLeader.userId).mutation(api.groups.updateGroupDetails, { groupId, frequency: "monthly" }),
    ).rejects.toThrow("Unauthorized");

    // Leaders read the details back through their context.
    const context = await ownerClient.query(api.profiles.currentContext, {});
    expect(context.ledGroups[0]).toMatchObject({ demographic: "couples" });
  });

  test("admins set details when creating and editing groups", async () => {
    const t = makeTest();
    const admin = await seedAdmin(t);
    const client = asUser(t, admin.userId);
    const created = await client.mutation(api.admin.createGroup, {
      name: "Bedok Youth",
      code: "BEDOK1",
      languages: ["english"],
      frequency: "fortnightly",
      demographic: "singles",
      location: "Bedok North",
    });
    expect(created).toMatchObject({
      languages: ["english"],
      frequency: "fortnightly",
      demographic: "singles",
      location: "Bedok North",
    });

    const regionId = await client.mutation(api.regions.create, { name: "East" });
    const edited = await client.mutation(api.admin.updateGroup, {
      groupId: created!._id,
      name: "Bedok Youth",
      code: "BEDOK1",
      isActive: true,
      regionId,
      demographic: "mixed",
      location: null,
    });
    expect(edited).toMatchObject({ regionId, demographic: "mixed", frequency: "fortnightly" });
    expect(edited?.location).toBeUndefined();

    // Omitting regionId keeps it; null removes it.
    const kept = await client.mutation(api.admin.updateGroup, {
      groupId: created!._id,
      name: "Bedok Youth",
      code: "BEDOK1",
      isActive: true,
    });
    expect(kept?.regionId).toBe(regionId);
    const removed = await client.mutation(api.admin.updateGroup, {
      groupId: created!._id,
      name: "Bedok Youth",
      code: "BEDOK1",
      isActive: true,
      regionId: null,
    });
    expect(removed?.regionId).toBeUndefined();
  });
});

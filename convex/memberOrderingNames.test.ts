import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  makeTest,
  resetBackendTestState,
  seedAdmin,
  seedGroup,
  seedMembership,
  seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

describe("member ordering and profile names", () => {
  test("owner reorder validates sections, persists ranks, and reactivation appends", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const co = await seedProfile(t, "Co");
    const first = await seedProfile(t, "First");
    const second = await seedProfile(t, "Second");
    const inactive = await seedProfile(t, "Inactive");
    const groupId = await seedGroup(t, owner.profileId, "ORDER1");
    const firstId = await seedMembership(t, first.profileId, groupId, "active", 10);
    const secondId = await seedMembership(t, second.profileId, groupId, "active", 20);
    const inactiveId = await seedMembership(t, inactive.profileId, groupId, "inactive", 30, 40);
    const admin = await seedAdmin(t);
    await asUser(t, admin.userId).mutation(api.admin.assignCoLeader, {
      groupId,
      profileId: co.profileId,
    });
    const ownerClient = asUser(t, owner.userId);

    await expect(
      ownerClient.mutation(api.groups.reorderMembers, {
        groupId,
        status: "active",
        membershipIds: [firstId, firstId],
      }),
    ).rejects.toThrow("unique");
    await expect(
      ownerClient.mutation(api.groups.reorderMembers, {
        groupId,
        status: "active",
        membershipIds: [firstId],
      }),
    ).rejects.toThrow("every member");
    await expect(
      ownerClient.mutation(api.groups.reorderMembers, {
        groupId,
        status: "active",
        membershipIds: [inactiveId, firstId],
      }),
    ).rejects.toThrow("every member");
    await expect(
      asUser(t, co.userId).mutation(api.groups.reorderMembers, {
        groupId,
        status: "active",
        membershipIds: [secondId, firstId],
      }),
    ).rejects.toThrow("Unauthorized");

    await ownerClient.mutation(api.groups.reorderMembers, {
      groupId,
      status: "active",
      membershipIds: [secondId, firstId],
    });
    let rows = await ownerClient.query(api.groups.listMembers, { groupId });
    expect(rows.map((row) => row.membership._id)).toEqual([secondId, firstId, inactiveId]);
    expect(rows.map((row) => row.membership.sortOrder)).toEqual([0, 1, 30]);

    await ownerClient.mutation(api.groups.reactivateMember, {
      groupId,
      membershipId: inactiveId,
    });
    rows = await ownerClient.query(api.groups.listMembers, { groupId });
    expect(rows.map((row) => row.membership._id)).toEqual([secondId, firstId, inactiveId]);
    expect(rows.at(-1)?.membership.status).toBe("active");
  });

  test("legacy names remain compatible while V2 writes require and dual-write both names", async () => {
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
    const legacy = await seedProfile(t, "Legacy Person", { serviceId });
    expect(
      (await asUser(t, legacy.userId).query(api.profiles.currentContext, {})).profileComplete,
    ).toBe(true);

    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "New Person" }));
    const client = asUser(t, userId);
    await client.mutation(api.profiles.getOrCreateCurrent, {});
    await expect(
      client.mutation(api.profiles.updateProfile, {
        fullName: "New Person",
        singaporeRegion: "central",
        serviceIds: [serviceId],
      }),
    ).resolves.toMatchObject({ fullName: "New Person" });
    await expect(
      client.mutation(api.profiles.updateProfileV2, {
        firstName: "New",
        lastName: " ",
        singaporeRegion: "central",
        serviceIds: [serviceId],
      }),
    ).rejects.toThrow("First and last name are required");

    const updated = await client.mutation(api.profiles.updateProfileV2, {
      firstName: " New ",
      lastName: " Person ",
      singaporeRegion: "central",
      serviceIds: [serviceId],
    });
    expect(updated).toMatchObject({
      firstName: "New",
      lastName: "Person",
      fullName: "New Person",
      onboardingStatus: "needsGroup",
    });

    // A legacy profile can preserve its existing unsplit value during rollout.
    await expect(
      asUser(t, legacy.userId).mutation(api.profiles.updateProfile, {
        fullName: "Legacy Person",
        singaporeRegion: "west",
        serviceIds: [serviceId],
      }),
    ).resolves.toMatchObject({ fullName: "Legacy Person", singaporeRegion: "west" });
  });
});


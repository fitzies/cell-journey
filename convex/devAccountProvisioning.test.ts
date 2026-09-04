import { afterEach, describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import {
  DEV_TEST_GROUP_CODE,
  DEV_TEST_GROUP_NAME,
  DEV_TEST_PROFILE_NAME,
  DEV_TEST_SERVICE_NAME,
} from "./devAccountProvisioning";
import { makeTest } from "../test/convexBackendTestHelpers";

const DEV_EMAIL = "dev@celljourney.test";
const previousDevEnabled = process.env.AUTH_DEV_LOGIN_ENABLED;
const previousDevEmail = process.env.AUTH_DEV_EMAIL;

function restoreEnvironment(
  key: "AUTH_DEV_LOGIN_ENABLED" | "AUTH_DEV_EMAIL",
  value: string | undefined,
) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restoreEnvironment("AUTH_DEV_LOGIN_ENABLED", previousDevEnabled);
  restoreEnvironment("AUTH_DEV_EMAIL", previousDevEmail);
});

function enableDevProvisioning() {
  process.env.AUTH_DEV_LOGIN_ENABLED = "true";
  process.env.AUTH_DEV_EMAIL = DEV_EMAIL;
}

async function seedVerifiedDevUser(t: ReturnType<typeof makeTest>) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email: DEV_EMAIL,
      emailVerificationTime: Date.now(),
    }),
  );
}

describe("development account provisioning", () => {
  test("has no effect unless dev login is explicitly enabled", async () => {
    const t = makeTest();
    const userId = await seedVerifiedDevUser(t);
    process.env.AUTH_DEV_LOGIN_ENABLED = "false";
    process.env.AUTH_DEV_EMAIL = DEV_EMAIL;

    await expect(
      t.mutation(internal.devAccountProvisioning.provision, {
        userId,
        email: DEV_EMAIL,
      }),
    ).rejects.toThrow("Development account provisioning is disabled");

    enableDevProvisioning();
    await expect(
      t.mutation(internal.devAccountProvisioning.provision, {
        userId,
        email: "someone-else@celljourney.test",
      }),
    ).rejects.toThrow("Development account email does not match");

    expect(
      await t.run((ctx) => ctx.db.query("userProfiles").take(1)),
    ).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("groups").take(1))).toHaveLength(
      0,
    );
  });

  test("creates a complete profile with member and leader access idempotently", async () => {
    const t = makeTest();
    const userId = await seedVerifiedDevUser(t);
    enableDevProvisioning();

    const first = await t.mutation(internal.devAccountProvisioning.provision, {
      userId,
      email: " DEV@CellJourney.Test ",
    });
    const second = await t.mutation(internal.devAccountProvisioning.provision, {
      userId,
      email: DEV_EMAIL,
    });
    expect(second).toEqual(first);

    const state = await t.run(async (ctx) => ({
      profile: await ctx.db.get(first.profileId),
      group: await ctx.db.get(first.groupId),
      membership: await ctx.db.get(first.membershipId),
      profiles: await ctx.db.query("userProfiles").take(10),
      groups: await ctx.db.query("groups").take(10),
      memberships: await ctx.db.query("memberships").take(10),
      periods: await ctx.db.query("membershipActivityPeriods").take(10),
      services: await ctx.db.query("services").take(10),
    }));

    expect(state.profile).toMatchObject({
      userId,
      identityEmailNormalized: DEV_EMAIL,
      fullName: DEV_TEST_PROFILE_NAME,
      firstName: "Cell Journey Dev",
      lastName: "Tester",
      postalDistrict: "D09",
      serviceIds: [state.services[0]._id],
      role: "leader",
      onboardingStatus: "approved",
      currentGroupId: first.groupId,
      activeMembershipId: first.membershipId,
      leaderGroupId: first.groupId,
    });
    expect(state.group).toMatchObject({
      name: DEV_TEST_GROUP_NAME,
      code: DEV_TEST_GROUP_CODE,
      leaderProfileId: first.profileId,
      isActive: true,
    });
    expect(state.membership).toMatchObject({
      profileId: first.profileId,
      groupId: first.groupId,
      status: "active",
    });
    expect(state.services).toHaveLength(1);
    expect(state.services[0]).toMatchObject({
      name: DEV_TEST_SERVICE_NAME,
      isActive: true,
    });
    expect(state.profiles).toHaveLength(1);
    expect(state.groups).toHaveLength(1);
    expect(state.memberships).toHaveLength(1);
    expect(state.periods).toHaveLength(1);
  });

  test("reuses an active service and preserves unrelated memberships", async () => {
    const t = makeTest();
    const userId = await seedVerifiedDevUser(t);
    enableDevProvisioning();

    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const serviceId = await ctx.db.insert("services", {
        name: "Existing Service",
        sortOrder: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const profileId = await ctx.db.insert("userProfiles", {
        userId,
        identityEmailNormalized: DEV_EMAIL,
        role: "member",
        onboardingStatus: "approved",
        fullName: "Old Dev Name",
        singaporeRegion: "central",
        serviceIds: [serviceId],
        createdAt: now,
        updatedAt: now,
      });
      const otherGroupId = await ctx.db.insert("groups", {
        name: "Unrelated Group",
        code: "OTHER1",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const otherMembershipId = await ctx.db.insert("memberships", {
        profileId,
        groupId: otherGroupId,
        status: "active",
        joinedAt: now,
        sortOrder: now,
      });
      await ctx.db.insert("membershipActivityPeriods", {
        membershipId: otherMembershipId,
        profileId,
        groupId: otherGroupId,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { serviceId, profileId, otherGroupId, otherMembershipId };
    });

    const provisioned = await t.mutation(
      internal.devAccountProvisioning.provision,
      { userId, email: DEV_EMAIL },
    );
    expect(provisioned.profileId).toBe(seeded.profileId);

    const state = await t.run(async (ctx) => ({
      profile: await ctx.db.get(seeded.profileId),
      otherGroup: await ctx.db.get(seeded.otherGroupId),
      otherMembership: await ctx.db.get(seeded.otherMembershipId),
      memberships: await ctx.db
        .query("memberships")
        .withIndex("by_profile_status", (q) =>
          q.eq("profileId", seeded.profileId).eq("status", "active"),
        )
        .take(10),
      services: await ctx.db.query("services").take(10),
    }));
    expect(state.profile?.serviceIds).toEqual([seeded.serviceId]);
    expect(state.otherGroup).toMatchObject({
      name: "Unrelated Group",
      isActive: true,
    });
    expect(state.otherGroup?.leaderProfileId).toBeUndefined();
    expect(state.otherMembership).toMatchObject({
      status: "active",
      groupId: seeded.otherGroupId,
    });
    expect(state.memberships).toHaveLength(2);
    expect(state.services).toHaveLength(1);
  });

  test("refuses to take over a group using the reserved dev code", async () => {
    const t = makeTest();
    const userId = await seedVerifiedDevUser(t);
    enableDevProvisioning();
    const collisionId = await t.run((ctx) => {
      const now = Date.now();
      return ctx.db.insert("groups", {
        name: "Existing Real Group",
        code: DEV_TEST_GROUP_CODE,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t.mutation(internal.devAccountProvisioning.provision, {
        userId,
        email: DEV_EMAIL,
      }),
    ).rejects.toThrow("reserved dev group code is already in use");

    expect(await t.run((ctx) => ctx.db.get(collisionId))).toMatchObject({
      name: "Existing Real Group",
    });
    expect(
      (await t.run((ctx) => ctx.db.get(collisionId)))?.leaderProfileId,
    ).toBeUndefined();
  });
});

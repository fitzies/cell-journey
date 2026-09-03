import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { claimInvitedProfileForAuthUser } from "./profiles";
import {
  asUser,
  makeTest,
  resetBackendTestState,
  seedAdmin,
  seedGroup,
  seedMembership,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

describe("pre-provisioned profiles", () => {
  test("an admin creates an awaiting-sign-in profile with a normalized email", async () => {
    const t = makeTest();
    const admin = await seedAdmin(t);
    const adminClient = asUser(t, admin.userId);

    const invited = await adminClient.mutation(api.admin.createInvitedProfile, {
      firstName: "  Jamie ",
      lastName: " Tan  ",
      email: "  Jamie.Tan@Example.COM ",
    });

    expect(invited).toMatchObject({
      firstName: "Jamie",
      lastName: "Tan",
      fullName: "Jamie Tan",
      invitedEmail: "jamie.tan@example.com",
      invitedByUserId: admin.userId,
      onboardingStatus: "profileIncomplete",
      serviceIds: [],
    });
    expect(invited?.userId).toBeUndefined();

    const rows = await adminClient.query(api.admin.listUsers, {
      search: "jamie.tan@example.com",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountStatus: "awaitingSignIn",
      displayName: "Jamie Tan",
      user: { email: "jamie.tan@example.com" },
      profile: { userId: null },
    });

    await expect(
      adminClient.mutation(api.admin.createInvitedProfile, {
        firstName: "Duplicate",
        lastName: "Person",
        email: "JAMIE.TAN@EXAMPLE.COM",
      }),
    ).rejects.toThrow("already uses this email");
  });

  test("a verified auth user claims the same profile and preserves relationships", async () => {
    const t = makeTest();
    const admin = await seedAdmin(t);
    const adminClient = asUser(t, admin.userId);
    const invited = await adminClient.mutation(api.admin.createInvitedProfile, {
      firstName: "Jamie",
      lastName: "Tan",
      email: "jamie@example.com",
    });
    const groupId = await seedGroup(t, admin.profileId, "CLAIM1");
    const membershipId = await seedMembership(t, invited!._id, groupId);
    const authUserId = await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Google Name",
        email: " Jamie@Example.com ",
        emailVerificationTime: Date.now(),
      }),
    );

    const claimed = await asUser(t, authUserId).mutation(
      api.profiles.getOrCreateCurrent,
      {},
    );
    expect(claimed).toMatchObject({
      _id: invited?._id,
      userId: authUserId,
      identityEmailNormalized: "jamie@example.com",
    });
    expect(claimed?.claimedAt).toEqual(expect.any(Number));

    const membership = await t.run((ctx) => ctx.db.get(membershipId));
    expect(membership?.profileId).toBe(invited?._id);

    const secondCall = await asUser(t, authUserId).mutation(
      api.profiles.getOrCreateCurrent,
      {},
    );
    expect(secondCall?._id).toBe(invited?._id);
    expect(secondCall?.claimedAt).toBe(claimed?.claimedAt);

    const rows = await adminClient.query(api.admin.listUsers, {
      search: "jamie@example.com",
    });
    expect(rows.find((row) => row.profile._id === invited?._id)).toMatchObject({
      accountStatus: "active",
      profile: { _id: invited?._id, userId: authUserId },
    });
  });

  test("an unverified auth user cannot claim, including before OTP verification", async () => {
    const t = makeTest();
    const admin = await seedAdmin(t);
    const invited = await asUser(t, admin.userId).mutation(
      api.admin.createInvitedProfile,
      {
        firstName: "Email",
        lastName: "User",
        email: "email-user@example.com",
      },
    );
    const authUserId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "email-user@example.com" }),
    );

    expect(
      await t.run((ctx) => claimInvitedProfileForAuthUser(ctx, authUserId)),
    ).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(invited!._id))).toMatchObject({
      invitedEmail: "email-user@example.com",
    });
    expect((await t.run((ctx) => ctx.db.get(invited!._id)))?.userId).toBeUndefined();

    await t.run((ctx) =>
      ctx.db.patch(authUserId, { emailVerificationTime: Date.now() }),
    );
    const claimed = await t.run((ctx) =>
      claimInvitedProfileForAuthUser(ctx, authUserId),
    );
    expect(claimed).toMatchObject({ _id: invited?._id, userId: authUserId });
  });

  test("claiming fails closed when invitation data is duplicated", async () => {
    const t = makeTest();
    const now = Date.now();
    const authUserId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "conflict@example.com",
        emailVerificationTime: now,
      }),
    );
    await t.run(async (ctx) => {
      for (const firstName of ["First", "Second"]) {
        await ctx.db.insert("userProfiles", {
          invitedEmail: "conflict@example.com",
          invitedAt: now,
          role: "member",
          onboardingStatus: "profileIncomplete",
          firstName,
          lastName: "Conflict",
          fullName: `${firstName} Conflict`,
          serviceIds: [],
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    await expect(
      t.run((ctx) => claimInvitedProfileForAuthUser(ctx, authUserId)),
    ).rejects.toThrow("Multiple profiles use this email");
    const linked = await t.run((ctx) =>
      ctx.db
        .query("userProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", authUserId))
        .take(1),
    );
    expect(linked).toHaveLength(0);
  });

  test("admin access requires a verified allowlisted email", async () => {
    const t = makeTest();
    process.env.ADMIN_EMAILS = "admin@example.com";
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "admin@example.com" }),
    );
    const client = asUser(t, userId);

    await expect(client.query(api.admin.me, {})).resolves.toMatchObject({
      isAdmin: false,
      reason: "emailNotVerified",
    });
    await expect(
      client.mutation(api.admin.createInvitedProfile, {
        firstName: "Blocked",
        lastName: "Admin",
        email: "person@example.com",
      }),
    ).rejects.toThrow("Verify your email");
  });
});

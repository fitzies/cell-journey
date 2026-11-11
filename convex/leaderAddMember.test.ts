import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { groupInviteEmailContent } from "./inviteEmails";
import {
  asUser,
  makeTest,
  resetBackendTestState,
  seedGroup,
  seedMembership,
  seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

type TestClient = ReturnType<typeof makeTest>;

async function activeMembership(t: TestClient, profileId: Id<"userProfiles">, groupId: Id<"groups">) {
  return await t.run((ctx) =>
    ctx.db
      .query("memberships")
      .withIndex("by_profile_and_group_and_status", (q) =>
        q.eq("profileId", profileId).eq("groupId", groupId).eq("status", "active"),
      )
      .unique(),
  );
}

describe("leaders add members by email", () => {
  test("a new person gets an invited profile, an active membership and an email", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner", { structured: true });
    const groupId = await seedGroup(t, owner.profileId, "ADDNEW");

    const result = await asUser(t, owner.userId).mutation(api.groups.addMemberByEmail, {
      groupId,
      firstName: " Jamie ",
      lastName: "Tan",
      email: " Jamie@Example.com ",
      dateOfBirth: "1995-04-12",
      sex: "female",
      phone: "+65 9123 4567",
    });
    expect(result.status).toBe("invited");

    const profile = await t.run((ctx) => ctx.db.get(result.profileId));
    expect(profile).toMatchObject({
      invitedEmail: "jamie@example.com",
      invitedByUserId: owner.userId,
      firstName: "Jamie",
      lastName: "Tan",
      dateOfBirth: "1995-04-12",
      sex: "female",
      phone: "+6591234567",
    });
    expect(profile?.userId).toBeUndefined();

    const membership = await activeMembership(t, result.profileId, groupId);
    expect(membership).not.toBeNull();
    const periods = await t.run((ctx) =>
      ctx.db
        .query("membershipActivityPeriods")
        .withIndex("by_membership_and_startedAt", (q) => q.eq("membershipId", membership!._id))
        .collect(),
    );
    expect(periods).toHaveLength(1);
    expect(periods[0].endedAt).toBeUndefined();

    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const invite = scheduled.find((job) => job.name.includes("inviteEmails"));
    expect(invite?.args[0]).toMatchObject({
      email: "jamie@example.com",
      firstName: "Jamie",
      groupName: "Group ADDNEW",
      addedByName: "Owner Test",
      isNewAccount: true,
    });

    // The roster shows the new person straight away.
    const roster = await asUser(t, owner.userId).query(api.groups.listMembers, { groupId });
    expect(roster.map((row) => row.profile?._id)).toContain(result.profileId);
  });

  test("the invited person claims the profile on sign-in and is already in the group", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const groupId = await seedGroup(t, owner.profileId, "CLAIMS");
    const { profileId } = await asUser(t, owner.userId).mutation(api.groups.addMemberByEmail, {
      groupId,
      firstName: "Jamie",
      lastName: "Tan",
      email: "jamie@example.com",
    });

    const authUserId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "Jamie@example.com", emailVerificationTime: Date.now() }),
    );
    const claimed = await asUser(t, authUserId).mutation(api.profiles.getOrCreateCurrent, {});
    expect(claimed?._id).toBe(profileId);
    expect(claimed?.userId).toBe(authUserId);

    const context = await asUser(t, authUserId).query(api.profiles.currentContext, {});
    expect(context.memberGroups.map((row) => row.group._id)).toEqual([groupId]);
    expect(context.canUseMemberMode).toBe(true);
    expect(context.pendingRequests).toEqual([]);
  });

  test("an existing account is added without creating another profile", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const groupId = await seedGroup(t, owner.profileId, "EXIST1");
    const existing = await seedProfile(t, "Existing", { email: "Existing@Example.com" });
    await t.run((ctx) =>
      ctx.db.insert("joinRequests", {
        profileId: existing.profileId,
        groupId,
        status: "pending",
        requestedAt: Date.now(),
      }),
    );
    const before = await t.run((ctx) => ctx.db.query("userProfiles").collect());

    const result = await asUser(t, owner.userId).mutation(api.groups.addMemberByEmail, {
      groupId,
      firstName: "Ignored",
      lastName: "Name",
      email: "existing@example.com",
      phone: "91234567",
    });
    expect(result).toEqual({ profileId: existing.profileId, status: "addedExisting" });
    expect(await t.run((ctx) => ctx.db.query("userProfiles").collect())).toHaveLength(before.length);

    const profile = await t.run((ctx) => ctx.db.get(existing.profileId));
    // The leader cannot overwrite someone else's existing details.
    expect(profile?.fullName).toBe("Existing");
    expect(profile?.phone).toBeUndefined();
    expect(await activeMembership(t, existing.profileId, groupId)).not.toBeNull();
    const request = await t.run((ctx) => ctx.db.query("joinRequests").first());
    expect(request).toMatchObject({ status: "approved", reviewedByProfileId: owner.profileId });

    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.find((job) => job.name.includes("inviteEmails"))?.args[0]).toMatchObject({
      isNewAccount: false,
    });

    await expect(
      asUser(t, owner.userId).mutation(api.groups.addMemberByEmail, {
        groupId,
        firstName: "Again",
        lastName: "Again",
        email: "existing@example.com",
      }),
    ).rejects.toThrow("already in this group");
  });

  test("co-leaders and outsiders cannot add members", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const coLeader = await seedProfile(t, "Co");
    const member = await seedProfile(t, "Member");
    const groupId = await seedGroup(t, owner.profileId, "NOCOLD");
    await seedMembership(t, member.profileId, groupId);
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
    for (const userId of [coLeader.userId, member.userId]) {
      await expect(
        asUser(t, userId).mutation(api.groups.addMemberByEmail, {
          groupId,
          firstName: "A",
          lastName: "B",
          email: "ab@example.com",
        }),
      ).rejects.toThrow("Unauthorized");
    }
  });

  test("invalid input is rejected before anything is written", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Owner");
    const groupId = await seedGroup(t, owner.profileId, "BADIN1");
    const client = asUser(t, owner.userId);
    const base = { groupId, firstName: "A", lastName: "B", email: "ab@example.com" };

    await expect(client.mutation(api.groups.addMemberByEmail, { ...base, email: "not-an-email" })).rejects.toThrow(
      "valid email",
    );
    await expect(client.mutation(api.groups.addMemberByEmail, { ...base, phone: "12345678" })).rejects.toThrow(
      "Singapore phone",
    );
    await expect(client.mutation(api.groups.addMemberByEmail, { ...base, dateOfBirth: "2999-01-01" })).rejects.toThrow(
      "date of birth",
    );
    await expect(client.mutation(api.groups.addMemberByEmail, { ...base, firstName: " " })).rejects.toThrow(
      "First and last name",
    );
    expect(await t.run((ctx) => ctx.db.query("memberships").collect())).toEqual([]);
  });
});

describe("group invite email", () => {
  test("new accounts are told to sign in; existing accounts to open the app; HTML is escaped", () => {
    const fresh = groupInviteEmailContent({
      email: "a@example.com",
      firstName: "<Ann>",
      groupName: "Tampines & Friends",
      addedByName: "Ben",
      isNewAccount: true,
    });
    expect(fresh.subject).toBe("You've been added to Tampines & Friends on Cell Journey");
    expect(fresh.text).toContain("Ben added you to Tampines & Friends");
    expect(fresh.text).toContain("sign in with a@example.com");
    expect(fresh.html).toContain("&lt;Ann&gt;");
    expect(fresh.html).toContain("Tampines &amp; Friends");

    const existing = groupInviteEmailContent({
      email: "a@example.com",
      firstName: "Ann",
      groupName: "G",
      addedByName: null,
      isNewAccount: false,
    });
    expect(existing.text).toContain("You've been added to G");
    expect(existing.text).toContain("Open the Cell Journey app");
  });
});

import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import {
  asUser, makeTest, resetBackendTestState, seedAdmin, seedEvent,
  seedGroup, seedMembership, seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

test("visitor classification preserves membership, history, access and present/absent attendance", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const member = await seedProfile(t, "Visitor");
  const groupId = await seedGroup(t, owner.profileId);
  const membershipId = await seedMembership(t, member.profileId, groupId);
  const eventId = await seedEvent(t, groupId, owner.profileId, Date.now() - 1000, Date.now() - 500);
  const leader = asUser(t, owner.userId);
  await leader.mutation(api.attendance.markForMember, { eventId, profileId: member.profileId, status: "present" });
  await leader.mutation(api.groups.markMemberVisitor, { groupId, membershipId });
  const detail = await leader.query(api.attendance.eventDetail, { eventId });
  expect(detail?.rows).toEqual(expect.arrayContaining([expect.objectContaining({
    eligibility: "required", effectiveStatus: "present",
    membership: expect.objectContaining({ _id: membershipId, status: "active", memberClass: "visitor" }),
  })]));
  expect(await leader.query(api.groups.getMemberProfile, { groupId, membershipId })).toMatchObject({ status: "visitor" });
  expect(await asUser(t, member.userId).query(api.attendance.historyForGroup, { groupId })).toMatchObject({ totalPastEvents: 1, presentEvents: 1 });
  await leader.mutation(api.attendance.markForMember, { eventId, profileId: member.profileId, status: "absent" });
  await leader.mutation(api.groups.reactivateMember, { groupId, membershipId });
  const membership = await t.run((ctx) => ctx.db.get(membershipId));
  expect(membership?.status).toBe("active");
  expect(membership?.memberClass).toBeUndefined();
  expect(await asUser(t, member.userId).query(api.attendance.historyForGroup, { groupId })).toMatchObject({ totalPastEvents: 1, presentEvents: 0 });
});

test("inactive to visitor resumes activity, and marking inactive closes it without changing history", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const member = await seedProfile(t, "Visitor");
  const groupId = await seedGroup(t, owner.profileId);
  const membershipId = await seedMembership(t, member.profileId, groupId, "inactive", 100, 500);
  const leader = asUser(t, owner.userId);
  await leader.mutation(api.groups.markMemberVisitor, { groupId, membershipId });
  vi.setSystemTime(2000);
  await leader.mutation(api.groups.markMemberInactive, { groupId, membershipId });
  const periods = await t.run((ctx) => ctx.db.query("membershipActivityPeriods").withIndex("by_membership_and_startedAt", (q) => q.eq("membershipId", membershipId)).take(10));
  expect(periods.map((period) => [period.startedAt, period.endedAt])).toEqual([[100, 500], [1000, 2000]]);
  const membership = await t.run((ctx) => ctx.db.get(membershipId));
  expect(membership?.status).toBe("inactive");
  expect(membership?.memberClass).toBeUndefined();
});

test("visitor order is separate from active members and rejects incomplete or mixed sections", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const groupId = await seedGroup(t, owner.profileId);
  const active = await seedProfile(t, "Active");
  const first = await seedProfile(t, "First visitor");
  const second = await seedProfile(t, "Second visitor");
  const activeId = await seedMembership(t, active.profileId, groupId);
  const firstId = await seedMembership(t, first.profileId, groupId);
  const secondId = await seedMembership(t, second.profileId, groupId);
  const leader = asUser(t, owner.userId);
  for (const membershipId of [firstId, secondId]) await leader.mutation(api.groups.markMemberVisitor, { groupId, membershipId });
  await leader.mutation(api.groups.reorderMembers, { groupId, status: "active", membershipIds: [activeId] });
  await leader.mutation(api.groups.reorderMembers, { groupId, status: "visitor", membershipIds: [secondId, firstId] });
  expect((await leader.query(api.groups.listMembers, { groupId })).map((row) => row.membership._id)).toEqual([activeId, secondId, firstId]);
  for (const membershipIds of [[firstId], [activeId, firstId]]) {
    await expect(leader.mutation(api.groups.reorderMembers, { groupId, status: "visitor", membershipIds })).rejects.toThrow("every member");
  }
});

test("only the selected group's owner can change visitor classification", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const member = await seedProfile(t, "Member");
  const co = await seedProfile(t, "Co");
  const admin = await seedAdmin(t);
  const groupId = await seedGroup(t, owner.profileId);
  const otherGroupId = await seedGroup(t, owner.profileId, "OTHER");
  const membershipId = await seedMembership(t, member.profileId, groupId);
  await asUser(t, admin.userId).mutation(api.admin.assignCoLeader, { groupId, profileId: co.profileId });
  for (const userId of [member.userId, co.userId]) {
    await expect(asUser(t, userId).mutation(api.groups.markMemberVisitor, { groupId, membershipId })).rejects.toThrow("Unauthorized");
  }
  await expect(asUser(t, owner.userId).mutation(api.groups.markMemberVisitor, { groupId: otherGroupId, membershipId })).rejects.toThrow("Member not found");
});


test("optional attendance stays visible and correctable after inactive to visitor to active", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(2000);
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const member = await seedProfile(t, "Visitor");
  const groupId = await seedGroup(t, owner.profileId);
  const membershipId = await seedMembership(t, member.profileId, groupId, "inactive", 100, 500);
  const eventId = await seedEvent(t, groupId, owner.profileId, 1000, 1500);
  const leader = asUser(t, owner.userId);
  await leader.mutation(api.attendance.markForMember, { eventId, profileId: member.profileId, status: "present" });
  await leader.mutation(api.groups.markMemberVisitor, { groupId, membershipId });
  for (const asVisitor of [true, false]) {
    if (!asVisitor) await leader.mutation(api.groups.reactivateMember, { groupId, membershipId });
    const detail = await leader.query(api.attendance.eventDetail, { eventId });
    expect(detail?.rows).toEqual(expect.arrayContaining([expect.objectContaining({ eligibility: "optional", effectiveStatus: "present" })]));
    expect(detail?.requiredCount).toBe(0);
    await leader.mutation(api.attendance.clearOptionalForMember, { eventId, profileId: member.profileId });
    await leader.mutation(api.attendance.markForMember, { eventId, profileId: member.profileId, status: "present" });
    await expect(leader.mutation(api.attendance.markForMember, { eventId, profileId: member.profileId, status: "absent" })).rejects.toThrow("only be marked present");
  }
});

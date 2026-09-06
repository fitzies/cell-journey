import { afterEach, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, makeTest, resetBackendTestState, seedProfile } from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]).buffer;

test("authenticated photo replacement preserves profile fields and deletes old storage", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const other = await seedProfile(t, "Other");
  const client = asUser(t, owner.userId);
  const first = await client.action(api.profilePhotos.upload, { bytes: jpeg });
  expect(await client.query(api.profilePhotos.current, {})).toBeTruthy();
  expect(await asUser(t, other.userId).query(api.profilePhotos.current, {})).toBeNull();
  const second = await client.action(api.profilePhotos.upload, { bytes: jpeg });
  expect(second).not.toBe(first);
  expect(await t.run(ctx => ctx.storage.get(first))).toBeNull();
  expect(await t.run(ctx => ctx.db.get(owner.profileId))).toMatchObject({ fullName: "Owner", avatarStorageId: second });
  expect(await t.run(ctx => ctx.db.get(other.profileId))).not.toHaveProperty("avatarStorageId");
});

test("rejects anonymous, non-image and oversized uploads", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const client = asUser(t, owner.userId);
  await expect(t.action(api.profilePhotos.upload, { bytes: jpeg })).rejects.toThrow("Not authenticated");
  await expect(client.action(api.profilePhotos.upload, { bytes: new TextEncoder().encode("<svg></svg>").buffer })).rejects.toThrow("valid JPEG");
  await expect(client.action(api.profilePhotos.upload, { bytes: new ArrayBuffer(512 * 1024 + 1) })).rejects.toThrow("512 KB");
  expect(await t.run(ctx => ctx.db.get(owner.profileId))).not.toHaveProperty("avatarStorageId");
});

test("a missing/deleted account cannot leave an uploaded file or attach another user's photo", async () => {
  const t = makeTest();
  const owner = await seedProfile(t, "Owner");
  const other = await seedProfile(t, "Other");
  const id = await asUser(t, other.userId).action(api.profilePhotos.upload, { bytes: jpeg });
  await expect(asUser(t, owner.userId).mutation(internal.profilePhotos.attach, { userId: other.userId, storageId: id })).rejects.toThrow("no longer available");
  await t.run(ctx => ctx.db.patch(owner.profileId, { userId: undefined }));
  await expect(asUser(t, owner.userId).action(api.profilePhotos.upload, { bytes: jpeg })).rejects.toThrow("Profile not found");
  expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(1);
});

test("uploaded and replaced photos reach authorized leader and admin views through join approval", async () => {
  const { seedAdmin, seedGroup, seedEvent } = await import("../test/convexBackendTestHelpers");
  const t = makeTest();
  const serviceId = await t.run(ctx => ctx.db.insert("services", {
    name: "Sunday", sortOrder: 1, isActive: true, createdAt: Date.now(), updatedAt: Date.now(),
  }));
  const member = await seedProfile(t, "Member", { serviceId });
  const leader = await seedProfile(t, "Leader");
  const outsider = await seedProfile(t, "Outsider");
  const admin = await seedAdmin(t);
  const groupId = await seedGroup(t, leader.profileId);
  const client = asUser(t, member.userId);
  const lead = asUser(t, leader.userId);
  const adminClient = asUser(t, admin.userId);
  await client.action(api.profilePhotos.upload, { bytes: jpeg });
  const firstUrl = await client.query(api.profilePhotos.current, {});
  const request = await client.mutation(api.groups.requestToJoinByCode, { code: "GROUP1" });
  expect(request?.status).toBe("pending");
  expect(await lead.query(api.groups.listPendingJoinRequestsForGroup, { groupId })).toMatchObject([
    { request: { _id: request!._id }, profile: { photoUrl: firstUrl } },
  ]);
  expect(await adminClient.query(api.admin.listPendingJoinRequests, {})).toMatchObject([
    { profile: { photoUrl: firstUrl } },
  ]);
  const unrelated = asUser(t, outsider.userId);
  await expect(unrelated.query(api.groups.listPendingJoinRequestsForGroup, { groupId })).rejects.toThrow();
  await expect(unrelated.mutation(api.groups.approveJoinRequest, { joinRequestId: request!._id })).rejects.toThrow();
  await lead.mutation(api.groups.approveJoinRequest, { joinRequestId: request!._id });
  expect(await lead.query(api.groups.listPendingJoinRequestsForGroup, { groupId })).toEqual([]);
  expect(await lead.query(api.groups.listMembers, { groupId })).toMatchObject([
    { membership: { status: "active" }, profile: { photoUrl: firstUrl } },
  ]);
  const eventId = await seedEvent(t, groupId, leader.profileId, Date.now() + 60_000, Date.now() + 120_000);
  await client.action(api.profilePhotos.upload, { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 0xff, 0xd9]).buffer });
  const nextUrl = await client.query(api.profilePhotos.current, {});
  expect(nextUrl).toBeTruthy();
  expect(nextUrl).not.toBe(firstUrl);
  expect((await lead.query(api.groups.listMembers, { groupId }))[0].profile?.photoUrl).toBe(nextUrl);
  expect((await lead.query(api.attendance.eventDetail, { eventId })).rows[0].profile.photoUrl).toBe(nextUrl);
  const people = await adminClient.query(api.admin.listUsers, {});
  expect(people.find(row => row.profile._id === member.profileId)?.profile.photoUrl).toBe(nextUrl);
  expect(people.find(row => row.profile._id === outsider.profileId)?.profile.photoUrl).toBeNull();
  await expect(unrelated.query(api.groups.listMembers, { groupId })).rejects.toThrow();
  await expect(unrelated.query(api.attendance.eventDetail, { eventId })).rejects.toThrow();
  await expect(unrelated.query(api.admin.listUsers, {})).rejects.toThrow();
});

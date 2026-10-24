import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { asUser, makeTest, resetBackendTestState, seedEvent, seedGroup, seedMembership, seedProfile } from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);
const now = Date.parse('2026-09-07T12:00:00Z');
const at = Date.parse('2026-09-04T12:00:00Z');
async function setup() {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const t = makeTest();
  const owner = await seedProfile(t, 'Owner');
  const groupId = await seedGroup(t, owner.profileId);
  const client = asUser(t, owner.userId);
  return { t, owner, groupId, client };
}

test('weights multiple meetings by eligible attendance, preserves historical eligibility and excludes optional members', async () => {
  const { t, owner, groupId, client } = await setup();
  const a = await seedProfile(t, 'A');
  const b = await seedProfile(t, 'B');
  const optional = await seedProfile(t, 'Optional');
  await seedMembership(t, a.profileId, groupId, 'inactive', at - 1000, at + 500);
  await seedMembership(t, b.profileId, groupId, 'active', at - 1000);
  await seedMembership(t, optional.profileId, groupId, 'inactive', at - 2000, at - 1000);
  const first = await seedEvent(t, groupId, owner.profileId, at, at + 100);
  const second = await seedEvent(t, groupId, owner.profileId, at + 1000, at + 1100);
  for (const [eventId, profileId, status] of [[first, a.profileId, 'present'], [first, b.profileId, 'absent'], [first, optional.profileId, 'present'], [second, b.profileId, 'present']] as const) {
    await client.mutation(api.attendance.markForMember, { eventId, profileId, status });
  }
  const result = await client.query(api.attendanceHeatmap.forGroup, { groupId, now });
  expect(result.days).toHaveLength(90);
  expect(result).toMatchObject({ rate: 2 / 3, completedEvents: 2, pendingEvents: 0 });
  expect(result.days.find(day => day.date === '2026-09-04')).toMatchObject({ required: 3, present: 2, marked: 3, rate: 2 / 3, events: [{ optionalPresent: 1 }, { required: 1 }] });
});

test('distinguishes unmarked, zero attendance, no eligible members and ongoing events; skips cancelled and future events', async () => {
  const { t, owner, groupId, client } = await setup();
  const member = await seedProfile(t, 'Member');
  await seedMembership(t, member.profileId, groupId, 'active', at - 1000);
  await seedEvent(t, groupId, owner.profileId, at, at + 100);
  const zero = await seedEvent(t, groupId, owner.profileId, at + 86_400_000, at + 86_400_100);
  await client.mutation(api.attendance.markForMember, { eventId: zero, profileId: member.profileId, status: 'absent' });
  await seedEvent(t, groupId, owner.profileId, at - 86_400_000, at - 86_399_900);
  await seedEvent(t, groupId, owner.profileId, now - 1000, now + 1000);
  await seedEvent(t, groupId, owner.profileId, at, at + 100, { cancelled: true });
  await seedEvent(t, groupId, owner.profileId, now + 1000, now + 2000);
  const result = await client.query(api.attendanceHeatmap.forGroup, { groupId, now });
  expect(result).toMatchObject({ rate: 0, completedEvents: 1, pendingEvents: 2 });
  expect(result.days.flatMap(day => day.events)).toHaveLength(4);
  expect(result.days.find(day => day.date === '2026-09-04')?.rate).toBeNull();
  expect(result.days.find(day => day.date === '2026-09-05')?.rate).toBe(0);
  expect(result.days.find(day => day.date === '2026-09-03')).toMatchObject({ rate: null, required: 0 });
});

test('uses Singapore midnight and a strict 90-day window, even when the caller supplies a future clock', async () => {
  const { t, owner, groupId, client } = await setup();
  const from = Date.parse('2026-06-09T16:00:00Z');
  await seedEvent(t, groupId, owner.profileId, from - 1, from);
  await seedEvent(t, groupId, owner.profileId, from, from + 100);
  await seedEvent(t, groupId, owner.profileId, Date.parse('2026-09-04T16:00:00Z'), Date.parse('2026-09-04T17:00:00Z'));
  const result = await client.query(api.attendanceHeatmap.forGroup, { groupId, now: now + 86_400_000 });
  expect(result.days[0].date).toBe('2026-06-10');
  expect(result.days[89].date).toBe('2026-09-07');
  expect(result.days.flatMap(day => day.events)).toHaveLength(2);
  expect(result.days.find(day => day.date === '2026-09-05')?.events).toHaveLength(1);
});

test('requires attendance access to the requested group', async () => {
  const { t, owner, groupId } = await setup();
  const stranger = await seedProfile(t, 'Stranger');
  await seedMembership(t, stranger.profileId, groupId);
  await expect(t.query(api.attendanceHeatmap.forGroup, { groupId, now })).rejects.toThrow();
  await expect(asUser(t, stranger.userId).query(api.attendanceHeatmap.forGroup, { groupId, now })).rejects.toThrow();
  const otherGroup = await seedGroup(t, stranger.profileId, 'OTHER');
  await expect(asUser(t, owner.userId).query(api.attendanceHeatmap.forGroup, { groupId: otherGroup, now })).rejects.toThrow();
});

test('forYear lists each started event of the Singapore calendar year with rates only for complete events', async () => {
  const { t, owner, groupId, client } = await setup();
  const a = await seedProfile(t, 'A');
  const b = await seedProfile(t, 'B');
  const yearStart = Date.parse('2025-12-31T16:00:00Z'); // 1 Jan 2026, 00:00 SGT
  await seedMembership(t, a.profileId, groupId, 'active', yearStart - 10_000);
  await seedMembership(t, b.profileId, groupId, 'inactive', yearStart - 10_000, at + 500);
  await seedEvent(t, groupId, owner.profileId, yearStart - 1, yearStart + 100, { title: 'Last year' });
  const first = await seedEvent(t, groupId, owner.profileId, yearStart, yearStart + 100, { title: 'New year' });
  const second = await seedEvent(t, groupId, owner.profileId, at, at + 100, { title: 'Both eligible' });
  const third = await seedEvent(t, groupId, owner.profileId, at + 1000, at + 1100, { title: 'After B left' });
  const unmarked = await seedEvent(t, groupId, owner.profileId, at + 2000, at + 2100, { title: 'Unmarked' });
  await seedEvent(t, groupId, owner.profileId, at + 3000, at + 3100, { cancelled: true });
  await seedEvent(t, groupId, owner.profileId, now + 1000, now + 2000, { title: 'Future' });
  for (const [eventId, profileId, status] of [
    [first, a.profileId, 'present'], [first, b.profileId, 'absent'],
    [second, a.profileId, 'present'], [second, b.profileId, 'present'],
    [third, a.profileId, 'absent'], [unmarked, b.profileId, 'present'],
  ] as const) {
    await client.mutation(api.attendance.markForMember, { eventId, profileId, status });
  }
  const result = await client.query(api.attendanceHeatmap.forYear, { groupId, now });
  expect(result).toMatchObject({ year: 2026, from: yearStart, to: Date.parse('2026-12-31T16:00:00Z') });
  expect(result.events.map(event => event.title)).toEqual(['New year', 'Both eligible', 'After B left', 'Unmarked']);
  expect(result.events.map(event => event.rate)).toEqual([0.5, 1, 0, null]);
  expect(result.events[3]).toMatchObject({ required: 1, present: 0, marked: 0, complete: false });
  expect(result.summary).toMatchObject({
    rate: 3 / 5, completedEvents: 3, recentRate: 3 / 5, recentEvents: 3, toMark: 1,
    lastGathering: { eventId: third, present: 0, required: 1 },
  });
});

test('forYear keeps ongoing fully marked events out of the average and the to-mark count', async () => {
  const { t, owner, groupId, client } = await setup();
  const member = await seedProfile(t, 'Member');
  await seedMembership(t, member.profileId, groupId, 'active', at - 1000);
  const ongoing = await seedEvent(t, groupId, owner.profileId, now - 1000, now + 1000);
  await client.mutation(api.attendance.markForMember, { eventId: ongoing, profileId: member.profileId, status: 'present' });
  const result = await client.query(api.attendanceHeatmap.forYear, { groupId, now });
  expect(result.events).toMatchObject([{ complete: false, rate: null, present: 1 }]);
  expect(result.summary).toMatchObject({ rate: null, completedEvents: 0, toMark: 0, lastGathering: null });
});

test('forYear requires attendance access to the requested group', async () => {
  const { t, groupId } = await setup();
  const stranger = await seedProfile(t, 'Stranger');
  await seedMembership(t, stranger.profileId, groupId);
  await expect(t.query(api.attendanceHeatmap.forYear, { groupId, now })).rejects.toThrow();
  await expect(asUser(t, stranger.userId).query(api.attendanceHeatmap.forYear, { groupId, now })).rejects.toThrow();
});

import { describe, expect, test } from 'vitest';
import type { Doc } from './_generated/dataModel';
import { eventToForm, parseEventForm } from '../apps/mobile/src/components/events/event-form';

function eventAt(startAt: number, endAt: number) {
  return {
    title: 'Gathering', location: 'Home', word: 'Alice', startAt, endAt,
  } as Doc<'events'>;
}

describe('event edit form', () => {
  test('prefills legacy venue and preserves an overnight schedule when editing text', () => {
    const startAt = new Date(2025, 0, 10, 23, 30, 15).getTime();
    const endAt = new Date(2025, 0, 11, 1, 30, 20).getTime();
    const form = eventToForm(eventAt(startAt, endAt));
    expect(form).toMatchObject({ venue: 'Home', word: 'Alice', worship: '', remarks: '' });
    expect(parseEventForm({ ...form, title: 'Prayer night', word: '' }, -Infinity)).toEqual({
      ok: true,
      value: { title: 'Prayer night', venue: 'Home', word: '', worship: '', remarks: '', startAt, endAt },
    });
  });

  test('allows past dates for edits while keeping the creation date restriction', () => {
    const startAt = new Date(2025, 0, 10, 19, 30).getTime();
    const form = eventToForm(eventAt(startAt, startAt + 7_200_000));
    expect(parseEventForm(form, -Infinity).ok).toBe(true);
    expect(parseEventForm(form, new Date(2026, 0, 1).getTime()).ok).toBe(false);
    const result = parseEventForm({ ...form, startTime: '18:30' }, -Infinity);
    expect(result.ok && result.value.startAt).toBe(new Date(2025, 0, 10, 18, 30).getTime());
    expect(parseEventForm({ ...form, endTime: '18:00' }, -Infinity).ok).toBe(false);
  });
});

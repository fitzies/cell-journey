import type { Doc } from '../../lib/api';
import { nextFridayEvening, startOfToday } from '../../lib/date';

export type EventForm = {
  title: string;
  venue: string;
  word: string;
  worship: string;
  remarks: string;
  date: string;
  startTime: string;
  endTime: string;
  originalSchedule?: { startAt: number; endAt: number };
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatDateInput(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTimeInput(ms: number) {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dateFromInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return new Date(startOfToday());
  const [, yearRaw, monthRaw, dayRaw] = match;
  const date = new Date(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw), 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return new Date(startOfToday());
  return date;
}

export function dateFromTimeInput(form: EventForm, value: string) {
  const date = dateFromInput(form.date);
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return date;
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

export function formatReadableDate(value: string) {
  return new Intl.DateTimeFormat('en-SG', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(dateFromInput(value));
}

export function formatReadableTime(value: string) {
  const form = { title: '', venue: '', word: '', worship: '', remarks: '', date: formatDateInput(startOfToday()), startTime: value, endTime: value };
  return new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit' }).format(dateFromTimeInput(form, value));
}

export function defaultEventForm(): EventForm {
  const startAt = nextFridayEvening();
  return {
    title: 'Cell Group',
    venue: '',
    word: '',
    worship: '',
    remarks: '',
    date: formatDateInput(startAt),
    startTime: formatTimeInput(startAt),
    endTime: formatTimeInput(startAt + 2 * 60 * 60 * 1000),
  };
}

export function eventToForm(event: Doc<'events'>): EventForm {
  return {
    originalSchedule: { startAt: event.startAt, endAt: event.endAt },
    title: event.title,
    venue: event.venue ?? event.location ?? '',
    word: event.word ?? '',
    worship: event.worship ?? '',
    remarks: event.remarks ?? '',
    date: formatDateInput(event.startAt),
    startTime: formatTimeInput(event.startAt),
    endTime: formatTimeInput(event.endAt),
  };
}

export function parseEventForm(form: EventForm, earliestStartAt: number): { ok: true; value: { title: string; venue: string; word: string; worship: string; remarks: string; startAt: number; endAt: number } } | { ok: false; message: string } {
  const title = form.title.trim();
  if (!title) return { ok: false, message: 'Add a title for this gathering.' };

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.date.trim());
  if (!dateMatch) return { ok: false, message: 'Use the date format YYYY-MM-DD.' };

  const startMatch = /^(\d{1,2}):(\d{2})$/.exec(form.startTime.trim());
  const endMatch = /^(\d{1,2}):(\d{2})$/.exec(form.endTime.trim());
  if (!startMatch || !endMatch) return { ok: false, message: 'Use 24-hour time, for example 19:30.' };

  const [, yearRaw, monthRaw, dayRaw] = dateMatch;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const startHour = Number(startMatch[1]);
  const startMinute = Number(startMatch[2]);
  const endHour = Number(endMatch[1]);
  const endMinute = Number(endMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return { ok: false, message: 'Enter a real calendar date.' };
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return { ok: false, message: 'Enter a valid 24-hour time.' };

  const start = new Date(year, month - 1, day, startHour, startMinute, 0, 0);
  const end = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return { ok: false, message: 'Enter a real calendar date.' };
  // Retain exact timestamps, including overnight events, when only text is edited.
  const original = form.originalSchedule;
  if (original && form.date === formatDateInput(original.startAt)
    && form.startTime === formatTimeInput(original.startAt)
    && form.endTime === formatTimeInput(original.endAt)) {
    start.setTime(original.startAt);
    end.setTime(original.endAt);
  }
  if (start.getTime() < earliestStartAt) return { ok: false, message: 'Events must be scheduled for today or later.' };
  if (end.getTime() <= start.getTime()) return { ok: false, message: 'End time must be after the start time.' };

  return {
    ok: true,
    value: {
      title,
      venue: form.venue.trim(),
      word: form.word.trim(),
      worship: form.worship.trim(),
      remarks: form.remarks.trim(),
      startAt: start.getTime(),
      endAt: end.getTime(),
    },
  };
}

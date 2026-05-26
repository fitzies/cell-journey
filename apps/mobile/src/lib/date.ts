export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDay(ms: number) {
  const date = new Date(ms);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

export function formatTimeRange(startAt: number, endAt: number) {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${new Intl.DateTimeFormat('en-SG', opts).format(startAt)}–${new Intl.DateTimeFormat('en-SG', opts).format(endAt)}`;
}

export function formatDateParts(ms: number) {
  const date = new Date(ms);
  return {
    day: new Intl.DateTimeFormat('en-SG', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('en-SG', { month: 'short' }).format(date).toUpperCase(),
  };
}

export function nextFridayEvening() {
  const d = new Date();
  const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilFriday);
  d.setHours(19, 30, 0, 0);
  return d.getTime();
}

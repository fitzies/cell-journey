import { useQuery } from 'convex/react';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { api, type Id } from '@/lib/api';

// Keep current gatherings visible, but never label an ended gathering as next.
export function useMemberUpcomingEvents(groupId: Id<'groups'> | undefined) {
  const [now, setNow] = useState(Date.now);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const candidates = useQuery(api.events.listForGroup, groupId ? { groupId, from: today.getTime(), limit: 100 } : 'skip');
  // Fetch upcoming events separately so earlier events cannot fill their page.
  const future = useQuery(api.events.listForGroup, groupId ? { groupId, from: now + 1, limit: 30 } : 'skip');
  const ongoing = candidates?.filter((event) => event.startAt <= now && event.endAt > now);
  const events = ongoing && future ? [...ongoing, ...future] : undefined;
  const nextBoundary = events?.reduce((next, event) => Math.min(next, event.startAt > now ? event.startAt : event.endAt), Infinity);

  useFocusEffect(useCallback(() => { setNow(Date.now()); }, []));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (nextBoundary === undefined || !Number.isFinite(nextBoundary)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(nextBoundary - Date.now(), 0) + 50, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [nextBoundary, now]);

  return events;
}

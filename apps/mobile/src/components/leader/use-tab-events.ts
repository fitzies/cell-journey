import { usePaginatedQuery, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useGroups } from '@/components/group-context';
import { api } from '@/lib/api';

export const LEADER_EVENT_PAGE_SIZE = 30;
const MAX_BOUNDARY_TIMER_MS = 2_147_000_000;

export function useLeaderTabEvents(phase: 'upcoming' | 'started') {
  const { context, selectedLeaderGroup: group } = useGroups();
  const [now, setNow] = useState(Date.now);
  const nextEvents = useQuery(api.events.listForGroup, group ? { groupId: group._id, from: now + 1, limit: 1 } : 'skip');
  const page = usePaginatedQuery(api.events.listForLeaderTab, group ? { groupId: group._id, phase, now } : 'skip', { initialNumItems: LEADER_EVENT_PAGE_SIZE });
  const nextStartAt = nextEvents?.[0]?.startAt;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (nextStartAt === undefined) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(nextStartAt - Date.now(), 0) + 50, MAX_BOUNDARY_TIMER_MS));
    return () => clearTimeout(timer);
  }, [nextStartAt, now]);

  return { context, group, ...page };
}

import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useEventActions } from '@/components/events/event-actions';
import { useGroups } from '@/components/group-context';
import { AttendanceEventCard, type AttendanceEventKind } from '@/components/leader/attendance-event-card';
import { EmptyState, LeaderScreen } from '@/components/leader/ui';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, textStyles, useAppTheme } from '@/constants/tokens';
import { api, type Doc } from '@/lib/api';

const MAX_BOUNDARY_TIMER_MS = 2_147_000_000;
const FEED_SCAN_SIZE = 30;
const UPCOMING_LIMIT = 12;
const RECENT_COMPLETED_LIMIT = 12;

type WorklistResult = FunctionReturnType<typeof api.attendance.attendanceWorklist>;
type WorklistRow = WorklistResult['rows'][number];
type CompletedResult = FunctionReturnType<typeof api.attendance.listRecentCompletedEvents>;
type CompletedRow = CompletedResult['rows'][number];
type FeedRow = {
  event: Doc<'events'>;
  kind: AttendanceEventKind;
  markedRequiredCount?: number;
  requiredCount?: number;
};

export default function LeaderEventsScreen() {
  const t = useAppTheme();
  const { context, selectedLeaderGroup: group } = useGroups();
  const { eventActions, importModal } = useEventActions(group);
  const [now, setNow] = useState(Date.now);
  const worklist = useQuery(
    api.attendance.attendanceWorklist,
    group ? { groupId: group._id, now, paginationOpts: { numItems: FEED_SCAN_SIZE, cursor: null } } : 'skip',
  );
  const upcoming = useQuery(api.events.listForGroup, group ? { groupId: group._id, from: now + 1, limit: UPCOMING_LIMIT } : 'skip');
  const completed = useQuery(api.attendance.listRecentCompletedEvents, group ? { groupId: group._id, limit: RECENT_COMPLETED_LIMIT } : 'skip');

  const nearestBoundary = useMemo(() => {
    const candidates = [
      ...(upcoming ?? []).map((event) => event.startAt),
      ...(worklist?.rows ?? []).filter((row) => row.event.endAt > now).map((row) => row.event.endAt),
      ...(completed?.rows ?? []).filter((row) => row.event.endAt > now).map((row) => row.event.endAt),
    ].filter((value) => value > now);
    return candidates.length ? Math.min(...candidates) : null;
  }, [completed, now, upcoming, worklist]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (nearestBoundary === null) return;
    const delay = Math.min(Math.max(nearestBoundary - Date.now(), 0) + 50, MAX_BOUNDARY_TIMER_MS);
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [nearestBoundary]);

  if (context === undefined || (group && (worklist === undefined || upcoming === undefined || completed === undefined))) return <LoadingState />;

  if (!group) {
    return (
      <LeaderScreen title="Events" eventActions={eventActions} contentStyle={styles.pageContent}>
        <View style={styles.empty}><EmptyState title="No group assigned." body="Once assigned, your gatherings will appear here." /></View>
      </LeaderScreen>
    );
  }

  const feed = buildFeed(worklist?.rows ?? [], upcoming ?? [], completed?.rows ?? [], now);
  const total = feed.open.length + feed.upcoming.length + feed.past.length;

  return (
    <LeaderScreen title="Events" eventActions={eventActions} contentStyle={styles.pageContent}>
      <Text style={[styles.group, { color: t.muted }]}>{group.name}</Text>

      {total ? (
        <View style={styles.listing}>
          <View style={styles.overview}>
            <Text style={[styles.overviewCount, { color: t.ink }]}>{total} {total === 1 ? 'gathering' : 'gatherings'}</Text>
            <Text style={[styles.sorted, { color: t.muted }]}>Sorted by date</Text>
          </View>
          <EventSection title="Open now" rows={feed.open} />
          <EventSection title="Upcoming" rows={feed.upcoming} />
          <EventSection title="Past" rows={feed.past} />
        </View>
      ) : (
        <View style={styles.empty}><EmptyState title="No gatherings yet." body="Use + to create an event or import your schedule." /></View>
      )}
      {importModal}
    </LeaderScreen>
  );
}

function buildFeed(worklist: WorklistRow[], upcoming: Doc<'events'>[], completed: CompletedRow[], now: number) {
  const seen = new Set<string>();
  const open: FeedRow[] = [];
  const past: FeedRow[] = [];

  for (const row of worklist) {
    seen.add(row.event._id);
    const item: FeedRow = {
      event: row.event,
      kind: row.phase === 'ongoing' ? 'open' : 'needs',
      markedRequiredCount: row.markedRequiredCount,
      requiredCount: row.requiredCount,
    };
    if (row.phase === 'ongoing') open.push(item);
    else past.push(item);
  }

  for (const row of completed) {
    if (seen.has(row.event._id)) continue;
    seen.add(row.event._id);
    const item: FeedRow = {
      event: row.event,
      kind: 'complete',
      markedRequiredCount: row.markedRequiredCount,
      requiredCount: row.requiredCount,
    };
    if (row.event.endAt > now) open.push(item);
    else past.push(item);
  }

  const future: FeedRow[] = upcoming
    .filter((event) => !seen.has(event._id))
    .map((event) => ({ event, kind: 'upcoming' as const }));

  open.sort((a, b) => a.event.startAt - b.event.startAt);
  future.sort((a, b) => a.event.startAt - b.event.startAt);
  past.sort((a, b) => b.event.startAt - a.event.startAt);
  return { open, upcoming: future, past };
}

function EventSection({ title, rows }: { title: string; rows: FeedRow[] }) {
  if (!rows.length) return null;
  return (
    <View style={styles.feedSection}>
      <View style={styles.feedHeading}>
        <SectionLabel>{title}</SectionLabel>
        <SectionCount count={rows.length} />
      </View>
      <View style={styles.feed}>
        {rows.map((row) => (
          <AttendanceEventCard key={row.event._id} event={row.event} kind={row.kind} status={statusFor(row)} />
        ))}
      </View>
    </View>
  );
}

function statusFor(row: FeedRow) {
  if (row.kind === 'upcoming') return 'Upcoming';
  const count = `${row.markedRequiredCount ?? 0}/${row.requiredCount ?? 0} marked`;
  if (row.kind === 'open') return `Check-in open · ${count}`;
  if (row.kind === 'complete') return `Complete · ${count}`;
  return `Needs attendance · ${count}`;
}

function SectionLabel({ children }: { children: ReactNode }) {
  const t = useAppTheme();
  return <Text style={[styles.sectionLabel, { color: t.ink }]}>{children}</Text>;
}

function SectionCount({ count }: { count: number }) {
  const t = useAppTheme();
  return <Text style={[styles.sectionCount, { color: t.muted }]}>{count} {count === 1 ? 'event' : 'events'}</Text>;
}

const styles = StyleSheet.create({
  pageContent: { paddingHorizontal: 20 },
  group: { ...textStyles.body, marginTop: 6 },
  listing: { marginTop: 27 },
  overview: { marginBottom: 24, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 },
  overviewCount: { fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.3 },
  sorted: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  feedSection: { marginBottom: 31 },
  feedHeading: { marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionLabel: { ...textStyles.section },
  sectionCount: { fontFamily: fonts.bodyMedium, fontSize: 11 },
  feed: { gap: 10 },
  empty: { marginTop: 28 },
});

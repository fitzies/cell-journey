import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [scan, setScan] = useState<{ scope: string; cursors: (string | null)[] }>({ scope: '', cursors: [null] });
  const scanScope = `${group?._id}:${now}`;
  const cursors = scan.scope === scanScope ? scan.cursors : [null];
  const cursor = cursors[cursors.length - 1];
  const worklist = useQuery(
    api.attendance.attendanceWorklist,
    group ? { groupId: group._id, now, paginationOpts: { numItems: FEED_SCAN_SIZE, cursor } } : 'skip',
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
        <View><EmptyState title="No group assigned." body="Once assigned, your gatherings will appear here." /></View>
      </LeaderScreen>
    );
  }

  const feed = buildFeed(worklist?.rows ?? [], upcoming ?? [], completed?.rows ?? []);
  const total = feed.attention.length + feed.upcoming.length + feed.marked.length;

  return (
    <LeaderScreen title="Events" eventActions={eventActions} contentStyle={styles.pageContent}>

      {total || worklist?.hasMoreToScan || cursor ? (
        <View>
          <Text style={[styles.groupName, { color: t.muted }]}>{group.name} · Leader</Text>
          <EventSection title="Needs attention" rows={feed.attention} showEmpty limited={!!worklist?.hasMoreToScan || !!cursor} />
          {!feed.attention.length ? (
            <View style={styles.emptyAttention}>
              <Text style={[styles.emptyTitle, { color: t.ink }]}>{worklist?.hasMoreToScan || cursor ? 'No unfinished attendance in this batch' : 'All caught up'}</Text>
              <Text style={[styles.helper, { color: t.muted }]}>{worklist?.hasMoreToScan || cursor ? 'Check the other events for attendance still to mark.' : feed.upcoming.length ? 'No attendance to finish. Upcoming events appear below.' : 'No attendance to finish.'}</Text>
            </View>
          ) : null}
          {worklist?.hasMoreToScan || cursor ? (
            <View style={styles.scanActions}>
              {cursor ? <Pressable accessibilityRole="button" onPress={() => setScan({ scope: scanScope, cursors: cursors.slice(0, -1) })} style={styles.scanButton}>
                <Text style={[styles.helper, { color: t.ink }]}>Newer events</Text>
              </Pressable> : null}
              {worklist?.hasMoreToScan ? <Pressable accessibilityRole="button" onPress={() => setScan({ scope: scanScope, cursors: [...cursors, worklist.continueCursor] })} style={styles.scanButton}>
                <Text style={[styles.helper, { color: t.ink }]}>Check older events →</Text>
              </Pressable> : null}
            </View>
          ) : null}
          <EventSection title="Upcoming" rows={feed.upcoming} limited={feed.upcoming.length === UPCOMING_LIMIT} />
          <View style={styles.feedSection}>
            <View style={styles.feedHeading}>
              <SectionLabel>Marked</SectionLabel>
              <Text style={[styles.sectionCount, { color: t.muted }]}>{feed.marked.length} recent {feed.marked.length === 1 ? 'event' : 'events'}</Text>
            </View>
            <View style={styles.feed}>
              {feed.marked.length ? feed.marked.map((row) => <EventCard key={row.event._id} row={row} />) : <Text style={[styles.helper, { color: t.muted }]}>No marked events in recent history.</Text>}
            </View>
          </View>
        </View>
      ) : (
        <View><EmptyState title="No gatherings yet." body="Use + to create an event or import your schedule." /></View>
      )}
      {importModal}
    </LeaderScreen>
  );
}

function buildFeed(worklist: WorklistRow[], upcoming: Doc<'events'>[], completed: CompletedRow[]) {
  const seen = new Set<string>();
  const attention: FeedRow[] = [];
  const marked: FeedRow[] = [];

  for (const row of worklist) {
    seen.add(row.event._id);
    const item: FeedRow = {
      event: row.event,
      kind: row.phase === 'ongoing' ? 'open' : 'needs',
      markedRequiredCount: row.markedRequiredCount,
      requiredCount: row.requiredCount,
    };
    attention.push(item);
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
    marked.push(item);
  }

  const future: FeedRow[] = upcoming
    .filter((event) => !seen.has(event._id))
    .map((event) => ({ event, kind: 'upcoming' as const }));

  attention.sort((a, b) => Number(b.kind === 'open') - Number(a.kind === 'open') || a.event.startAt - b.event.startAt);
  future.sort((a, b) => a.event.startAt - b.event.startAt);
  marked.sort((a, b) => b.event.startAt - a.event.startAt);
  return { attention, upcoming: future, marked };
}

function EventSection({ title, rows, showEmpty = false, limited = false }: { title: string; rows: FeedRow[]; showEmpty?: boolean; limited?: boolean }) {
  if (!rows.length && !showEmpty) return null;
  return (
    <View style={styles.feedSection}>
      <View style={styles.feedHeading}>
        <SectionLabel>{title}</SectionLabel>
        <SectionCount count={rows.length} limited={limited} />
      </View>
      <View style={styles.feed}>
        {rows.map((row) => (
          <EventCard key={row.event._id} row={row} />
        ))}
      </View>
    </View>
  );
}

function EventCard({ row }: { row: FeedRow }) {
  const required = row.requiredCount ?? 0;
  const marked = row.markedRequiredCount ?? 0;
  const needsMarking = row.kind === 'open' || row.kind === 'needs';
  const status = row.kind === 'upcoming' ? "Attendance isn't due yet"
    : row.kind === 'complete' ? required ? `All ${required} marked` : 'No attendance required'
      : `${marked} of ${required} marked`;
  return <AttendanceEventCard event={row.event} kind={row.kind} status={status}
    feedSummary={{
      progressFraction: needsMarking && required > 0 ? Math.min(Math.max(marked / required, 0), 1) : undefined,
      action: needsMarking ? 'Mark' : undefined,
    }} />;
}

function SectionLabel({ children }: { children: ReactNode }) {
  const t = useAppTheme();
  return <Text style={[styles.sectionLabel, { color: t.ink }]}>{children}</Text>;
}

function SectionCount({ count, limited }: { count: number; limited: boolean }) {
  const t = useAppTheme();
  return <Text style={[styles.sectionCount, { color: t.muted }]}>{count} {count === 1 ? 'event' : 'events'}{limited ? ' shown' : ''}</Text>;
}

const styles = StyleSheet.create({
  pageContent: { paddingHorizontal: 20 },
  groupName: { fontFamily: fonts.bodyMedium, fontSize: 12, marginBottom: 24 },
  emptyAttention: { marginTop: -16, marginBottom: 24, paddingVertical: 12, gap: 5 },
  emptyTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  helper: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  scanActions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: -20, marginBottom: 24 },
  scanButton: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 4 },
  feedSection: { marginBottom: 31 },
  feedHeading: { marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionLabel: { ...textStyles.section },
  sectionCount: { fontFamily: fonts.bodyMedium, fontSize: 11 },
  feed: { gap: 10 },
});

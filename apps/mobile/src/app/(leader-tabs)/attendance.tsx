import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GroupSwitcher, useGroups } from '@/components/group-context';
import { OrderedRosterScreen, type OrderedRosterEntry } from '@/components/leader/ordered-roster';
import { EmptyState, Mark, RowCard, SectionHeader } from '@/components/leader/ui';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { formatDay, formatTimeRange } from '@/lib/date';
import { api, type Id } from '@/lib/api';

const MAX_BOUNDARY_TIMER_MS = 2_147_000_000;
const WORKLIST_PAGE_SIZE = 12;
const RECENT_COMPLETED_LIMIT = 10;

type AttendanceDetail = FunctionReturnType<typeof api.attendance.eventDetail>;
type AttendanceRow = AttendanceDetail['rows'][number];
type WorklistResult = FunctionReturnType<typeof api.attendance.attendanceWorklist>;
type WorklistRow = WorklistResult['rows'][number];

type SelectedEvents = Record<string, Id<'events'>>;
type WorklistSessions = Record<string, { cursor: string | null; scanNow: number; loadedRows: WorklistRow[] }>;

function currentWorklistTime() {
  return Date.now();
}

function mergeWorklistRows(...pages: WorklistRow[][]) {
  const rows = new Map<string, WorklistRow>();
  for (const page of pages) {
    for (const row of page) rows.set(row.event._id, row);
  }
  return [...rows.values()].sort((a, b) => b.event.startAt - a.event.startAt);
}

export default function LeaderAttendanceScreen() {
  const t = useAppTheme();
  const { context, selectedLeaderGroup: group } = useGroups();
  const [nowBucket, setNowBucket] = useState(currentWorklistTime);
  const [selectedEvents, setSelectedEvents] = useState<SelectedEvents>({});
  const [worklistSessions, setWorklistSessions] = useState<WorklistSessions>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const hasGroup = Boolean(group);
  const canMark = Boolean(group?.capabilities.markAttendance);
  const canReorder = Boolean(group?.capabilities.reorderMembers);
  const worklistSession = group ? worklistSessions[group._id] : undefined;
  const olderCursor = worklistSession?.cursor ?? null;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNowBucket(currentWorklistTime());
    });
    return () => subscription.remove();
  }, []);

  // Keep the newest page subscribed while older bounded pages are scanned.
  // This lets a just-started event appear even after the leader has loaded history.
  const firstWorklistPage = useQuery(
    api.attendance.attendanceWorklist,
    group
      ? { groupId: group._id, now: nowBucket, paginationOpts: { numItems: WORKLIST_PAGE_SIZE, cursor: null } }
      : 'skip',
  );
  const upcomingEvents = useQuery(
    api.events.listForGroup,
    group ? { groupId: group._id, from: nowBucket + 1, limit: 1 } : 'skip',
  );
  const nextStartedEventEnd = firstWorklistPage?.rows.reduce<number | null>(
    (nearest, row) => row.event.endAt > nowBucket && (nearest === null || row.event.endAt < nearest) ? row.event.endAt : nearest,
    null,
  ) ?? null;
  const nextEventBoundary = Math.min(
    upcomingEvents?.[0]?.startAt ?? Number.POSITIVE_INFINITY,
    nextStartedEventEnd ?? Number.POSITIVE_INFINITY,
  );

  useEffect(() => {
    if (!Number.isFinite(nextEventBoundary)) return;
    const delay = Math.min(Math.max(nextEventBoundary - Date.now(), 0), MAX_BOUNDARY_TIMER_MS);
    const timer = setTimeout(() => setNowBucket(currentWorklistTime()), delay);
    return () => clearTimeout(timer);
  }, [nextEventBoundary]);

  const olderWorklistPage = useQuery(
    api.attendance.attendanceWorklist,
    group && olderCursor !== null && worklistSession
      ? { groupId: group._id, now: worklistSession.scanNow, paginationOpts: { numItems: WORKLIST_PAGE_SIZE, cursor: olderCursor } }
      : 'skip',
  );
  const recentCompleted = useQuery(
    api.attendance.listRecentCompletedEvents,
    group ? { groupId: group._id, limit: RECENT_COMPLETED_LIMIT } : 'skip',
  );
  const mergedEventRows = mergeWorklistRows(
    firstWorklistPage?.rows ?? [],
    worklistSession?.loadedRows ?? [],
    olderWorklistPage?.rows ?? [],
  );
  const rememberedId = group ? selectedEvents[group._id] : undefined;
  const selectedEventId = rememberedId ?? mergedEventRows[0]?.event._id ?? null;
  const detail = useQuery(api.attendance.eventDetail, selectedEventId ? { eventId: selectedEventId } : 'skip');
  const eventRows = mergedEventRows.filter(
    (row) => !(row.event._id === selectedEventId && detail?.isComplete),
  );
  const canonicalMembers = useQuery(
    api.groups.listMembers,
    group && canReorder ? { groupId: group._id } : 'skip',
  );

  const mark = useMutation(api.attendance.markForMember);
  const clearOptional = useMutation(api.attendance.clearOptionalForMember);
  const reorder = useMutation(api.groups.reorderMembers);

  if (
    context === undefined ||
    (hasGroup && (firstWorklistPage === undefined || recentCompleted === undefined || (selectedEventId && detail === undefined) || (canReorder && canonicalMembers === undefined)))
  ) return <LoadingState />;

  if (!group) {
    return (
      <OrderedRosterScreen
        eyebrow="Attendance"
        title="Mark the room."
        hint="Your leader account is not assigned yet."
        headerContent={<EmptyState title="No group assigned." body="Once assigned, you’ll be able to mark attendance for your members." />}
        activeRows={[]}
        inactiveRows={[]}
        showSections={false}
        renderRow={() => null}
      />
    );
  }

  const requiredEntries: OrderedRosterEntry<AttendanceRow>[] = (detail?.rows ?? [])
    .filter((row) => row.eligibility === 'required')
    .map((row) => ({
      id: row.membership._id,
      value: row,
      reorderable: canReorder && row.membership.status === 'active',
    }));
  const optionalEntries: OrderedRosterEntry<AttendanceRow>[] = (detail?.rows ?? [])
    .filter((row) => row.eligibility === 'optional')
    .map((row) => ({
      id: row.membership._id,
      value: row,
      reorderable: canReorder && row.membership.status === 'inactive',
    }));

  const selectEvent = (eventId: Id<'events'>) => {
    setSelectedEvents((current) => ({ ...current, [group._id]: eventId }));
  };

  const loadingOlder = olderCursor !== null && olderWorklistPage === undefined;
  const paginationPage = olderCursor === null ? firstWorklistPage : olderWorklistPage;
  const canLoadOlder = loadingOlder || Boolean(paginationPage?.hasMoreToScan);

  const loadOlder = () => {
    if (!paginationPage?.hasMoreToScan || !paginationPage.continueCursor) return;
    setWorklistSessions((current) => {
      const session = current[group._id];
      const loadedRows = olderCursor === null
        ? (session?.loadedRows ?? [])
        : mergeWorklistRows(session?.loadedRows ?? [], paginationPage.rows);
      return {
        ...current,
        [group._id]: {
          cursor: paginationPage.continueCursor,
          scanNow: session?.scanNow ?? paginationPage.timeBucket,
          loadedRows,
        },
      };
    });
  };

  const markMember = async (row: AttendanceRow, status: 'present' | 'absent') => {
    if (!selectedEventId) return;
    const operationId = `${row.profile._id}:${status}`;
    setBusyId(operationId);
    try {
      await mark({ eventId: selectedEventId, profileId: row.profile._id, status });
    } catch (error) {
      Alert.alert('Could not mark attendance', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const clearMember = async (row: AttendanceRow) => {
    if (!selectedEventId) return;
    const operationId = `${row.profile._id}:clear`;
    setBusyId(operationId);
    try {
      await clearOptional({ eventId: selectedEventId, profileId: row.profile._id });
    } catch (error) {
      Alert.alert('Could not clear attendance', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const persistOrder = async (section: 'active' | 'inactive', visibleRows: OrderedRosterEntry<AttendanceRow>[]) => {
    const canonicalSection = (canonicalMembers ?? []).filter((row) => row.membership.status === section);
    const visibleIds = visibleRows.map((row) => row.value.membership._id);
    const visibleSet = new Set(visibleIds);
    let nextVisibleIndex = 0;
    const membershipIds = canonicalSection.map((row) => {
      if (!visibleSet.has(row.membership._id)) return row.membership._id;
      const nextId = visibleIds[nextVisibleIndex];
      nextVisibleIndex += 1;
      return nextId;
    });
    await reorder({ groupId: group._id, status: section, membershipIds });
  };

  const selectedIsInWorklist = eventRows.some((row) => row.event._id === selectedEventId);
  const completedRows = recentCompleted?.rows ?? [];
  const headerContent = (
    <>
      <GroupSwitcher mode="leader" />
      <SectionHeader title="Needs attendance" meta={`${eventRows.length} loaded`} />
      {eventRows.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventStrip}>
          {eventRows.map(({ event, phase, markedRequiredCount, requiredCount }) => {
            const selected = event._id === selectedEventId;
            return (
              <Pressable
                key={event._id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => selectEvent(event._id)}
                style={({ pressed }) => [
                  styles.eventCard,
                  {
                    backgroundColor: selected ? t.selected : t.surface,
                    borderColor: selected ? t.accent : t.line,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  },
                ]}
              >
                <Text style={[styles.eventPhase, { color: selected ? t.accent : t.muted }]}>{phase === 'ongoing' ? 'Happening now' : 'Past event'}</Text>
                <Text numberOfLines={1} style={[styles.eventTitle, { color: t.ink }]}>{event.title}</Text>
                <Text style={[styles.eventDetail, { color: t.muted }]}>{formatDay(event.startAt)} · {markedRequiredCount}/{requiredCount} marked</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <EmptyState
          title={canLoadOlder ? 'No incomplete events in this batch.' : detail?.isComplete ? 'All required attendance is marked.' : 'No events to mark.'}
          body={canLoadOlder ? 'Scan earlier events with Load older.' : detail?.isComplete ? 'The selected event stays open below for corrections.' : 'Started incomplete events will appear here automatically.'}
        />
      )}
      {canLoadOlder ? (
        <Pressable
          accessibilityRole="button"
          disabled={loadingOlder}
          onPress={loadOlder}
          style={({ pressed }) => [
            styles.loadOlder,
            {
              backgroundColor: t.surface,
              borderColor: t.line,
              opacity: loadingOlder ? 0.55 : 1,
              transform: [{ scale: pressed && !loadingOlder ? 0.99 : 1 }],
            },
          ]}
        >
          <Text style={[styles.loadOlderText, { color: t.ink }]}>{loadingOlder ? 'Loading older…' : 'Load older'}</Text>
          <Text style={[styles.loadOlderHint, { color: t.muted }]}>Scan the next {WORKLIST_PAGE_SIZE} scheduled events</Text>
        </Pressable>
      ) : null}

      <View style={[styles.correctionPicker, { backgroundColor: t.soft, borderColor: t.line }]}>
        <SectionHeader title="Recently completed" meta="Correct attendance" />
        {completedRows.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.correctionStrip}>
            {completedRows.map(({ event, markedRequiredCount, requiredCount }) => {
              const selected = event._id === selectedEventId;
              return (
                <Pressable
                  key={event._id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => selectEvent(event._id)}
                  style={({ pressed }) => [
                    styles.correctionCard,
                    {
                      backgroundColor: selected ? t.selected : t.surface,
                      borderColor: selected ? t.accent : t.line,
                      transform: [{ scale: pressed ? 0.985 : 1 }],
                    },
                  ]}
                >
                  <Text style={[styles.correctionLabel, { color: selected ? t.accent : t.muted }]}>Corrections open</Text>
                  <Text numberOfLines={1} style={[styles.correctionTitle, { color: t.ink }]}>{event.title}</Text>
                  <Text style={[styles.correctionMeta, { color: t.muted }]}>{formatDay(event.startAt)} · {markedRequiredCount}/{requiredCount}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={[styles.noCorrections, { color: t.muted }]}>Completed attendance will stay available here for quick corrections.</Text>
        )}
      </View>

      {detail ? (
        <View style={[styles.selectedEvent, { backgroundColor: t.surface, borderColor: detail.isComplete ? t.success : t.line }]}>
          <View style={styles.selectedEventTop}>
            <Text style={[styles.selectedLabel, { color: detail.isComplete ? t.success : t.accent }]}>
              {detail.isComplete && !selectedIsInWorklist ? 'Complete · corrections open' : 'Selected event'}
            </Text>
            <Text style={[styles.progress, { color: t.muted }]}>{detail.markedRequiredCount}/{detail.requiredCount}</Text>
          </View>
          <Text style={[styles.selectedTitle, { color: t.ink }]}>{detail.event.title}</Text>
          <Text style={[styles.selectedMeta, { color: t.muted }]}>{formatDay(detail.event.startAt)} · {formatTimeRange(detail.event.startAt, detail.event.endAt)}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <OrderedRosterScreen
      eyebrow="Attendance"
      title="Mark the room."
      hint="Only started events needing attendance are shown. Completed events stay selected for corrections."
      headerContent={headerContent}
      activeRows={requiredEntries}
      inactiveRows={optionalEntries}
      activeTitle="Required members"
      activeDescription="Everyone in this section needs a final attendance mark."
      activeEmptyText="No members were required for this event."
      inactiveTitle="Inactive · optional"
      inactiveDescription="Not required. Mark present only if they attended."
      inactiveEmptyText="No inactive members are connected to this group."
      showSections={Boolean(detail)}
      canReorder={canReorder}
      onReorder={persistOrder}
      onReorderError={(error) => Alert.alert('Could not save member order', error instanceof Error ? error.message : 'Please try again.')}
      renderRow={({ value: row }) => {
        const current = row.effectiveStatus;
        const optional = row.eligibility === 'optional';
        const name = row.displayName || 'Unnamed member';
        const rowBusy = busyId?.startsWith(`${row.profile._id}:`) ?? false;
        return (
          <RowCard
            mark={<Mark success={current === 'present'} danger={current === 'absent'}>{current === 'present' ? '✓' : current === 'absent' ? '—' : optional ? '○' : '?'}</Mark>}
            title={name}
            detail={optional ? (current === 'present' ? 'Not required · Present' : 'Not required') : current ? `Marked ${current}` : 'Attendance required'}
          >
            <View style={styles.actions}>
              <AttendanceChoice
                label={busyId === `${row.profile._id}:present` ? 'Saving…' : 'Present'}
                tone="present"
                selected={current === 'present'}
                disabled={busyId !== null || !canMark}
                onPress={() => void markMember(row, 'present')}
              />
              {optional ? (
                <AttendanceChoice
                  label={busyId === `${row.profile._id}:clear` ? 'Clearing…' : 'Clear'}
                  tone="clear"
                  selected={false}
                  disabled={busyId !== null || current === null || !canMark}
                  onPress={() => void clearMember(row)}
                />
              ) : (
                <AttendanceChoice
                  label={busyId === `${row.profile._id}:absent` ? 'Saving…' : 'Absent'}
                  tone="absent"
                  selected={current === 'absent'}
                  disabled={busyId !== null || !canMark}
                  onPress={() => void markMember(row, 'absent')}
                />
              )}
            </View>
            {rowBusy ? <Text style={[styles.savingText, { color: t.muted }]}>Updating attendance…</Text> : null}
          </RowCard>
        );
      }}
    />
  );
}

function AttendanceChoice({
  label,
  tone,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  tone: 'present' | 'absent' | 'clear';
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useAppTheme();
  const selectedColor = tone === 'present' ? t.success : tone === 'absent' ? t.danger : t.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected ? selectedColor : t.surface,
          borderColor: selected ? selectedColor : t.line,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
      ]}
    >
      <Text style={[styles.choiceText, { color: selected ? t.accentInk : tone === 'absent' ? t.danger : t.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eventStrip: { gap: 10, paddingRight: 24 },
  eventCard: { width: 216, borderWidth: 1, borderRadius: radius.lg, padding: 14 },
  eventPhase: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase' },
  eventTitle: { marginTop: 7, fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.25 },
  eventDetail: { marginTop: 5, fontFamily: fonts.body, fontSize: 12.5 },
  loadOlder: { marginTop: 12, minHeight: 54, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  loadOlderText: { fontFamily: fonts.bodySemiBold, fontSize: 14.5 },
  loadOlderHint: { flexShrink: 1, fontFamily: fonts.body, fontSize: 11.5, textAlign: 'right' },
  correctionPicker: { marginTop: 18, borderWidth: 1, borderRadius: radius.xl, paddingHorizontal: 14, paddingBottom: 14, overflow: 'hidden' },
  correctionStrip: { gap: 8, paddingRight: 14 },
  correctionCard: { width: 184, borderWidth: 1, borderRadius: radius.lg, padding: 12 },
  correctionLabel: { fontFamily: fonts.bodyBold, fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase' },
  correctionTitle: { marginTop: 6, fontFamily: fonts.bodySemiBold, fontSize: 14.5 },
  correctionMeta: { marginTop: 4, fontFamily: fonts.body, fontSize: 11.5 },
  noCorrections: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, paddingBottom: 4 },
  selectedEvent: { marginTop: 14, borderWidth: 1, borderRadius: radius.xl, padding: 18 },
  selectedEventTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedLabel: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.25, textTransform: 'uppercase' },
  progress: { fontFamily: fonts.bodyBold, fontSize: 12 },
  selectedTitle: { marginTop: 10, fontFamily: fonts.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.5 },
  selectedMeta: { marginTop: 5, fontFamily: fonts.body, fontSize: 13.5 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  choice: { flex: 1, minHeight: 46, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  choiceText: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, letterSpacing: -0.15 },
  savingText: { marginTop: 7, fontFamily: fonts.body, fontSize: 11.5 },
});

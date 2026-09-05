import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGroups } from '@/components/group-context';
import { AttendanceEventCardContent, type AttendanceEventKind } from '@/components/leader/attendance-event-card';
import { ActionButton, EmptyState, LeaderScreen } from '@/components/leader/ui';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api, type Id } from '@/lib/api';

type AttendanceDetail = FunctionReturnType<typeof api.attendance.eventDetail>;
type AttendanceRow = AttendanceDetail['rows'][number];
type AttendanceStatus = 'present' | 'absent' | null;
type AttendanceFilter = 'all' | 'review' | 'marked';
const MAX_BOUNDARY_TIMER_MS = 2_147_000_000;

export default function AttendanceEventScreen() {
  const t = useAppTheme();
  const params = useLocalSearchParams<{ eventId: string | string[] }>();
  const eventIdParam = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const eventId = eventIdParam as Id<'events'> | undefined;
  const { context } = useGroups();
  const detail = useQuery(api.attendance.eventDetail, eventId ? { eventId } : 'skip');
  const mark = useMutation(api.attendance.markForMember);
  const clearOptional = useMutation(api.attendance.clearOptionalForMember);
  const [filter, setFilter] = useState<AttendanceFilter>('all');
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);

  const futureBoundary = detail && detail.event.startAt > now ? detail.event.startAt : null;
  useEffect(() => {
    if (futureBoundary === null) return;
    const delay = Math.min(Math.max(futureBoundary - now, 0) + 50, MAX_BOUNDARY_TIMER_MS);
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [futureBoundary, now]);

  const derived = useMemo(() => {
    const rows = detail?.rows ?? [];
    const hasDraft = (row: AttendanceRow) => Object.prototype.hasOwnProperty.call(draft, row.profile._id);
    const valueFor = (row: AttendanceRow) => hasDraft(row) ? draft[row.profile._id] : row.effectiveStatus;
    const isFinalized = (row: AttendanceRow) => Boolean(row.attendance?.finalStatus || hasDraft(row));
    const markedRequiredCount = rows.filter((row) => row.eligibility === 'required' && valueFor(row) !== null).length;
    const reviewCount = rows.filter((row) => row.eligibility === 'required' && !isFinalized(row)).length;
    const markedCount = rows.filter(isFinalized).length;
    const filtered = rows.filter((row) => {
      if (filter === 'review') return row.eligibility === 'required' && !isFinalized(row);
      if (filter === 'marked') return isFinalized(row);
      return true;
    });
    return { rows, filtered, markedRequiredCount, reviewCount, markedCount };
  }, [detail, draft, filter]);

  if (context === undefined || (eventId && detail === undefined)) return <LoadingState />;

  if (!eventId || !detail) {
    return (
      <LeaderScreen title="" headerShown={false} contentStyle={styles.pageContent}>
        <View style={styles.empty}><EmptyState title="Gathering unavailable." body="Return to Events and choose another gathering." /></View>
        <ActionButton label="Back to Events" onPress={() => router.canGoBack() ? router.back() : router.replace('/(leader-tabs)/attendance')} />
      </LeaderScreen>
    );
  }

  const kind: AttendanceEventKind = detail.event.startAt > now
    ? 'upcoming'
    : detail.event.endAt > now
      ? 'open'
      : detail.isComplete
        ? 'complete'
        : 'needs';
  const readOnly = detail.event.startAt > now || !detail.capabilities.markAttendance;
  const status = statusFor(kind, derived.markedRequiredCount, detail.requiredCount);
  const remaining = Math.max(detail.requiredCount - derived.markedRequiredCount, 0);
  const progress = detail.requiredCount ? derived.markedRequiredCount / detail.requiredCount : 1;

  const choose = (row: AttendanceRow, status: AttendanceStatus) => {
    if (readOnly || saving) return;
    setDraft((current) => ({ ...current, [row.profile._id]: status }));
  };

  const save = async () => {
    if (readOnly || saving || !eventId) return;
    const changedRows = derived.rows.filter((row) => Object.prototype.hasOwnProperty.call(draft, row.profile._id));
    if (!changedRows.length) return;
    setSaving(true);
    const saved: string[] = [];
    try {
      for (const row of changedRows) {
        const nextStatus = draft[row.profile._id] ?? null;
        if (row.eligibility === 'optional' && nextStatus === null) {
          await clearOptional({ eventId, profileId: row.profile._id });
        } else if (nextStatus) {
          await mark({ eventId, profileId: row.profile._id, status: nextStatus });
        }
        saved.push(row.profile._id);
      }
      setDraft({});
    } catch (error) {
      setDraft((current) => {
        const next = { ...current };
        saved.forEach((id) => delete next[id]);
        return next;
      });
      Alert.alert('Some attendance was not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <LeaderScreen title="" headerShown={false} contentStyle={styles.pageContent}>
      <View>
        <Link.AppleZoomTarget>
          <AttendanceEventCardContent
            event={detail.event}
            kind={kind}
            status={status}
            tail="down"
            onPress={() => router.back()}
          />
        </Link.AppleZoomTarget>
      </View>

      <Text style={[styles.context, { color: t.muted }]}>{contextFor(kind, readOnly)}</Text>

      <View style={styles.progressBlock}>
        <View style={styles.progressCopy}>
          <Text style={[styles.progressTitle, { color: t.ink }]}>{derived.markedRequiredCount} of {detail.requiredCount} marked</Text>
          <Text style={[styles.progressMeta, { color: t.muted }]}>{remaining} remaining</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: t.soft }]}>
          <View style={[styles.progressFill, { backgroundColor: t.accent, width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>

      <View style={[styles.filters, { backgroundColor: t.soft }]}>
        <FilterButton label={`All ${derived.rows.length}`} value="all" selected={filter === 'all'} onPress={setFilter} />
        <FilterButton label={`To review ${derived.reviewCount}`} value="review" selected={filter === 'review'} onPress={setFilter} />
        <FilterButton label={`Marked ${derived.markedCount}`} value="marked" selected={filter === 'marked'} onPress={setFilter} />
      </View>

      {derived.filtered.length ? (
        <View style={[styles.memberList, { borderTopColor: t.line }]}>
          {derived.filtered.map((row) => (
            <MemberRow
              key={row.membership._id}
              row={row}
              value={Object.prototype.hasOwnProperty.call(draft, row.profile._id) ? draft[row.profile._id] : row.effectiveStatus}
              touched={Object.prototype.hasOwnProperty.call(draft, row.profile._id)}
              disabled={readOnly || saving}
              onChoose={(value) => choose(row, value)}
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.noMatches, { color: t.muted }]}>No members in this view.</Text>
      )}

      {!readOnly && derived.rows.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || !Object.keys(draft).length }}
          disabled={saving || !Object.keys(draft).length}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: t.accent,
              opacity: saving || !Object.keys(draft).length ? 0.36 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            },
          ]}
        >
          <Text style={[styles.saveText, { color: t.accentInk }]}>{saving ? 'Saving…' : 'Save attendance'}</Text>
        </Pressable>
      ) : null}
    </LeaderScreen>
  );
}

function statusFor(kind: AttendanceEventKind, marked: number, required: number) {
  if (kind === 'upcoming') return 'Upcoming';
  if (kind === 'open') return `Check-in open · ${marked}/${required} marked`;
  if (kind === 'complete') return `Complete · ${marked}/${required} marked`;
  return `Needs attendance · ${marked}/${required} marked`;
}

function contextFor(kind: AttendanceEventKind, readOnly: boolean) {
  if (kind === 'upcoming') return 'Attendance opens when this gathering begins. You can review the roster now.';
  if (readOnly) return 'You can review this attendance record, but you do not have permission to change it.';
  if (kind === 'open') return 'Check-in is open now. Review self-marked attendance or mark the remaining members.';
  if (kind === 'complete') return 'Attendance is complete. You can still make a correction if something changed.';
  return 'This gathering still needs attendance. Mark the remaining members, then save.';
}

function FilterButton({ label, value, selected, onPress }: { label: string; value: AttendanceFilter; selected: boolean; onPress: (value: AttendanceFilter) => void }) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={() => onPress(value)}
      style={[styles.filterButton, selected && { backgroundColor: t.surface, borderColor: t.line }]}
    >
      <Text numberOfLines={1} style={[styles.filterText, { color: selected ? t.ink : t.muted }]}>{label}</Text>
    </Pressable>
  );
}

function MemberRow({ row, value, touched, disabled, onChoose }: { row: AttendanceRow; value: AttendanceStatus; touched: boolean; disabled: boolean; onChoose: (value: AttendanceStatus) => void }) {
  const t = useAppTheme();
  const initials = (row.displayName || 'Member').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const selfMarked = !row.attendance?.finalStatus && row.attendance?.memberSubmittedStatus === 'present' && !touched;
  const detail = touched
    ? value === null ? 'Will clear optional attendance' : `Ready to mark ${value}`
    : row.attendance?.finalStatus
      ? `Marked ${row.attendance.finalStatus}`
      : selfMarked
        ? 'Self-marked present · review'
        : row.eligibility === 'optional'
          ? 'Not required for this gathering'
          : 'Attendance required';

  return (
    <View style={[styles.memberRow, { borderBottomColor: t.line }]}>
      <View style={[styles.avatar, { backgroundColor: t.soft }]}><Text style={[styles.initials, { color: t.ink }]}>{initials}</Text></View>
      <View style={styles.memberCopy}>
        <Text style={[styles.memberName, { color: t.ink }]} numberOfLines={1}>{row.displayName || 'Unnamed member'}</Text>
        <Text style={[styles.memberDetail, { color: t.muted }]} numberOfLines={1}>{detail}</Text>
      </View>
      <View style={[styles.statusActions, disabled && styles.disabledActions]}>
        <StatusButton
          label={`Mark ${row.displayName} present`}
          icon="checkmark"
          selected={value === 'present'}
          outlined={selfMarked && value === 'present'}
          disabled={disabled}
          onPress={() => onChoose('present')}
        />
        <StatusButton
          label={row.eligibility === 'optional' ? `Clear ${row.displayName}` : `Mark ${row.displayName} absent`}
          icon={row.eligibility === 'optional' ? 'xmark' : 'minus'}
          selected={row.eligibility === 'required' ? value === 'absent' : value === null && touched}
          disabled={disabled}
          onPress={() => onChoose(row.eligibility === 'optional' ? null : 'absent')}
        />
      </View>
    </View>
  );
}

function StatusButton({ label, icon, selected, outlined = false, disabled, onPress }: { label: string; icon: 'checkmark' | 'minus' | 'xmark'; selected: boolean; outlined?: boolean; disabled: boolean; onPress: () => void }) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.statusButton,
        {
          backgroundColor: selected && !outlined ? t.accent : 'transparent',
          borderColor: selected ? t.accent : t.line,
          borderWidth: outlined ? 2 : 1,
          transform: [{ scale: pressed ? 0.93 : 1 }],
        },
      ]}
    >
      <SymbolView name={{ ios: icon, android: icon === 'checkmark' ? 'check' : icon === 'minus' ? 'remove' : 'close', web: icon === 'checkmark' ? 'check' : icon === 'minus' ? 'remove' : 'close' }} size={17} tintColor={selected && !outlined ? t.accentInk : t.ink} weight="semibold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pageContent: { paddingHorizontal: 20 },
  context: { marginTop: 13, marginHorizontal: 2, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  progressBlock: { marginTop: 25 },
  progressCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 },
  progressTitle: { fontFamily: fonts.bodySemiBold, fontSize: 22, letterSpacing: -0.75 },
  progressMeta: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  progressTrack: { height: 5, marginTop: 10, overflow: 'hidden', borderRadius: radius.pill },
  progressFill: { height: '100%', borderRadius: radius.pill },
  filters: { marginTop: 24, padding: 4, borderRadius: 15, flexDirection: 'row', gap: 4 },
  filterButton: { flex: 1, minHeight: 36, paddingHorizontal: 5, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  filterText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  memberList: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  memberRow: { minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.bodySemiBold, fontSize: 13, letterSpacing: -0.2 },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { fontFamily: fonts.bodySemiBold, fontSize: 15, letterSpacing: -0.2 },
  memberDetail: { marginTop: 3, fontFamily: fonts.body, fontSize: 11 },
  statusActions: { flexDirection: 'row', gap: 7 },
  disabledActions: { opacity: 0.34 },
  statusButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  saveButton: { minHeight: 56, marginTop: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  saveText: { fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.25 },
  noMatches: { paddingVertical: 38, fontFamily: fonts.body, fontSize: 14, textAlign: 'center' },
  empty: { marginTop: 12, marginBottom: 16 },
});

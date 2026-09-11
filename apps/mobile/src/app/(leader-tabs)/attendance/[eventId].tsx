import { ProfileAvatar } from '@/components/profile-avatar';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Link, router, useLocalSearchParams, useSegments } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { type PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGroups } from '@/components/group-context';
import { AttendanceEventCardContent, type AttendanceEventKind } from '@/components/leader/attendance-event-card';
import { ActionButton, EmptyState } from '@/components/leader/ui';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api, type Id } from '@/lib/api';

type AttendanceDetail = FunctionReturnType<typeof api.attendance.eventDetail>;
type AttendanceRow = AttendanceDetail['rows'][number];
type AttendanceStatus = 'present' | 'absent' | null;
const MAX_BOUNDARY_TIMER_MS = 2_147_000_000;

export default function AttendanceEventScreen() {
  const t = useAppTheme();
  const segments = useSegments();
  const closeAttendance = () => router.dismissTo(segments[1] === 'schedule' ? '/(leader-tabs)/schedule' : '/(leader-tabs)/attendance');
  const params = useLocalSearchParams<{ eventId: string | string[] }>();
  const eventIdParam = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const eventId = eventIdParam as Id<'events'> | undefined;
  const { context } = useGroups();
  const detail = useQuery(api.attendance.eventDetail, eventId ? { eventId } : 'skip');
  const mark = useMutation(api.attendance.markForMember);
  const clearOptional = useMutation(api.attendance.clearOptionalForMember);
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

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
    const markedRequiredCount = rows.filter((row) => row.eligibility === 'required' && valueFor(row) !== null).length;
    const presentCount = rows.filter((row) => valueFor(row) === 'present').length;
    return {
      rows, markedRequiredCount, presentCount,
      members: rows.filter((row) => row.membership.memberClass !== 'visitor'),
      visitors: rows.filter((row) => row.membership.memberClass === 'visitor'),
    };
  }, [detail, draft]);

  if (context === undefined || (eventId && detail === undefined)) return <LoadingState />;

  if (!eventId || !detail) {
    return (
      <AttendanceScreenContent>
        <View style={styles.empty}><EmptyState title="Gathering unavailable." body="Return to Events and choose another gathering." /></View>
        <ActionButton label="Back to Events" onPress={closeAttendance} />
      </AttendanceScreenContent>
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
  const status = statusFor(kind, derived.presentCount, derived.rows.length);
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
      if (mounted.current) {
        setDraft({});
        closeAttendance();
      }
    } catch (error) {
      if (!mounted.current) return;
      setDraft((current) => {
        const next = { ...current };
        saved.forEach((id) => delete next[id]);
        return next;
      });
      Alert.alert('Some attendance was not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <AttendanceScreenContent>
      <View>
        <Link.AppleZoomTarget>
          <AttendanceEventCardContent
            event={detail.event}
            kind={kind}
            status={status}
            tail="down"
            onPress={saving ? undefined : closeAttendance}
          />
        </Link.AppleZoomTarget>
      </View>

      <Text style={[styles.context, { color: t.muted }]}>{contextFor(kind, readOnly)}</Text>

      <View style={styles.progressBlock}>
        <View style={styles.progressCopy}>
          <Text style={[styles.progressTitle, { color: t.ink }]}>{derived.presentCount} of {derived.rows.length} present</Text>
          <Text style={[styles.progressMeta, { color: t.muted }]}>{remaining} remaining</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: t.soft }]}>
          <View style={[styles.progressFill, { backgroundColor: t.accent, width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>

      {derived.rows.length ? (
        <View>
          {([
            { title: 'Members', rows: derived.members },
            { title: 'Visitors', rows: derived.visitors },
          ]).map((section) => section.rows.length ? (
            <View key={section.title}>
              {derived.visitors.length > 0 ? <Text accessibilityRole="header" style={[styles.sectionTitle, { color: t.ink }]}>{section.title} · {section.rows.length}</Text> : null}
              <View style={[styles.memberList, { borderTopColor: t.line }]}>
                {section.rows.map((row) => (
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
            </View>
          ) : null)}
        </View>
      ) : (
        <Text style={[styles.noMatches, { color: t.muted }]}>No members for this gathering.</Text>
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
    </AttendanceScreenContent>
  );
}

function AttendanceScreenContent({ children }: PropsWithChildren) {
  const t = useAppTheme();
  return <ScrollView style={{ flex: 1, backgroundColor: t.background }} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.pageContent}>
    {children}
  </ScrollView>;
}

function statusFor(kind: AttendanceEventKind, present: number, total: number) {
  if (kind === 'upcoming') return 'Upcoming';
  if (kind === 'open') return `Happening now · ${present}/${total} present`;
  if (kind === 'complete') return `Complete · ${present}/${total} present`;
  return `Needs attendance · ${present}/${total} present`;
}

function contextFor(kind: AttendanceEventKind, readOnly: boolean) {
  if (kind === 'upcoming') return 'Attendance opens when this gathering begins. You can review the roster now.';
  if (readOnly) return 'You can review this attendance record, but you do not have permission to change it.';
  if (kind === 'open') return 'Record attendance for this gathering. Mark the remaining members, then save.';
  if (kind === 'complete') return 'Attendance is complete. You can still make a correction if something changed.';
  return 'This gathering still needs attendance. Mark the remaining members, then save.';
}

function MemberRow({ row, value, touched, disabled, onChoose }: { row: AttendanceRow; value: AttendanceStatus; touched: boolean; disabled: boolean; onChoose: (value: AttendanceStatus) => void }) {
  const t = useAppTheme();
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
      <ProfileAvatar photoUrl={row.profile.photoUrl} name={row.displayName || 'Unnamed member'} />
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
  pageContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 108 },
  sectionTitle: { marginTop: 24, fontFamily: fonts.bodySemiBold, fontSize: 17 },
  context: { marginTop: 13, marginHorizontal: 2, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  progressBlock: { marginTop: 25 },
  progressCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 },
  progressTitle: { fontFamily: fonts.bodySemiBold, fontSize: 22, letterSpacing: -0.75 },
  progressMeta: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  progressTrack: { height: 5, marginTop: 10, overflow: 'hidden', borderRadius: radius.pill },
  progressFill: { height: '100%', borderRadius: radius.pill },
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

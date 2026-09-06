import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { MemberChevron, MemberEmptyState, MemberEventCard, MemberHistoryRow, MemberScreen, MemberSection } from '@/components/member/ui';
import { useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

type EventRow = {
  _id: string;
  title: string;
  location?: string;
  venue?: string;
  startAt: number;
  endAt: number;
};

const ONE_HOUR = 60 * 60 * 1000;

function nowMinusWindow() {
  return Date.now() - ONE_HOUR;
}

function isAttendanceOpen(event: EventRow | undefined, now: number) {
  if (!event) return false;
  return now >= event.startAt - ONE_HOUR && now <= event.endAt + ONE_HOUR;
}

export default function MemberHomeScreen() {
  const t = useAppTheme();
  const [queryFrom] = useState(() => nowMinusWindow());
  const [renderNow] = useState(Date.now);
  const { context, selectedMemberGroup } = useGroups();
  const group = selectedMemberGroup?.group ?? null;
  const events = useQuery(api.events.listForGroup, group ? { groupId: group._id, from: queryFrom, limit: 5 } : 'skip');
  const attendance = useQuery(api.attendance.historyForGroup, group ? { groupId: group._id, limit: 3 } : 'skip');
  const selfSubmit = useMutation(api.attendance.selfSubmit);
  const [busy, setBusy] = useState(false);

  if (context === undefined || !group || events === undefined || attendance === undefined) return <LoadingState />;

  const eventRows = events as EventRow[];
  const next = eventRows.find((event) => event.endAt + ONE_HOUR >= renderNow);
  const checkInOpen = isAttendanceOpen(next, renderNow);
  const rate = attendance.attendanceRate === null ? '—' : `${Math.round(attendance.attendanceRate * 100)}%`;

  const checkIn = async () => {
    if (!next || !checkInOpen) return;
    setBusy(true);
    try {
      await selfSubmit({ eventId: next._id as never });
      Alert.alert('You’re checked in', 'Your attendance has been submitted for this event.');
    } catch (err) {
      Alert.alert('Check-in failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MemberScreen title="Home">
      <Text style={[styles.groupName, { color: t.text }]}>{group.name}</Text>
      <Text style={[styles.groupMeta, { color: t.muted }]}>Your group</Text>

      {next ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !checkInOpen || busy, busy }}
            onPress={checkIn}
            disabled={!checkInOpen || busy}
            style={({ pressed }) => [styles.checkButton, {
              backgroundColor: checkInOpen ? t.accent : t.surface,
              ...surfaceShadow(t, checkInOpen ? 'buttonFilled' : 'button'),
              opacity: busy ? 0.6 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            }]}
          >
            {busy ? <ActivityIndicator size="small" color={t.accentInk} /> : <SymbolView
              name={checkInOpen ? { ios: 'checkmark', android: 'check', web: 'check' } : { ios: 'clock', android: 'schedule', web: 'schedule' }}
              size={20} tintColor={checkInOpen ? t.accentInk : t.muted} weight="semibold"
            />}
            <Text style={[styles.checkText, { color: checkInOpen ? t.accentInk : t.muted }]}>
              {busy ? 'Checking in…' : checkInOpen ? 'Check in now' : 'Check-in opens near event time'}
            </Text>
          </Pressable>
          {!checkInOpen ? <Text style={[styles.checkHint, { color: t.muted }]}>Available from 1 hour before the gathering.</Text> : null}
        </>
      ) : null}

      <MemberSection title="Next gathering" action={
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/(member-tabs)/schedule')}>
          <Text style={[styles.sectionAction, { color: t.text }]}>See events</Text>
        </Pressable>
      }>
        {next ? <MemberEventCard event={next} onPress={() => router.push('/(member-tabs)/schedule')} /> : (
          <MemberEmptyState title="Nothing scheduled" body="Your next gathering will appear here once scheduled." />
        )}
      </MemberSection>

      <MemberSection title="Your attendance">
        <Pressable accessibilityRole="button" onPress={() => router.push('/(member-tabs)/attendance')}
          style={({ pressed }) => [styles.attendanceSummary, { backgroundColor: t.surface, ...surfaceShadow(t), opacity: pressed ? 0.68 : 1 }]}>
          <View style={styles.summaryCopy}>
            <Text style={[styles.summaryLabel, { color: t.text }]}>Attendance rate</Text>
            <Text style={[styles.summaryMeta, { color: t.muted }]}>{attendance.presentEvents} of {attendance.totalPastEvents} gatherings attended</Text>
          </View>
          <Text style={[styles.summaryRate, { color: t.text }]}>{rate}</Text>
          <MemberChevron />
        </Pressable>
      </MemberSection>

      <MemberSection title="Recent attendance">
        {attendance.rows.length > 0 ? (
          <View style={[styles.history, { borderTopColor: t.track }]}>
            {attendance.rows.slice(0, 3).map((row) => <MemberHistoryRow key={row.event._id} event={row.event} status={row.status} />)}
          </View>
        ) : <MemberEmptyState title="No attendance yet" body="After your first past event, your recent attendance will show here." />}
      </MemberSection>
    </MemberScreen>
  );
}

const styles = StyleSheet.create({
  groupName: { marginTop: 16, fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.3 },
  groupMeta: { ...textStyles.body, marginTop: 5 },
  checkButton: { minHeight: 46, marginTop: 20, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  checkText: { ...textStyles.button, flexShrink: 1, textAlign: 'center' },
  checkHint: { ...textStyles.body, marginTop: 10, textAlign: 'center' },
  sectionAction: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  attendanceSummary: { minHeight: 82, borderRadius: radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryLabel: { ...textStyles.body, fontFamily: fonts.bodySemiBold, letterSpacing: -0.3 },
  summaryMeta: { ...textStyles.body, marginTop: 5 },
  summaryRate: { ...textStyles.title, fontVariant: ['tabular-nums'] },
  history: { borderTopWidth: 1 },
});

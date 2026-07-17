import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GroupSwitcher, useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
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

function firstName(name?: string) {
  return name?.trim().split(/\s+/)[0] || 'there';
}

function initials(name?: string) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return 'CJ';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function formatDay(ms: number) {
  const date = new Date(ms);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-SG', { weekday: 'long', day: 'numeric', month: 'short' }).format(date);
}

function formatTimeRange(startAt: number, endAt: number) {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${new Intl.DateTimeFormat('en-SG', opts).format(startAt)}–${new Intl.DateTimeFormat('en-SG', opts).format(endAt)}`;
}

function isAttendanceOpen(event?: EventRow) {
  if (!event) return false;
  const now = Date.now();
  return now >= event.startAt - ONE_HOUR && now <= event.endAt + ONE_HOUR;
}

export default function MemberHomeScreen() {
  const t = useAppTheme();
  const [queryFrom] = useState(() => nowMinusWindow());
  const profile = useQuery(api.profiles.current, {});
  const { context, selectedMemberGroup } = useGroups();
  const group = selectedMemberGroup?.group ?? null;
  const events = useQuery(api.events.listForGroup, group ? { groupId: group._id, from: queryFrom, limit: 5 } : 'skip');
  const attendance = useQuery(api.attendance.historyForGroup, group ? { groupId: group._id, limit: 3 } : 'skip');
  const selfSubmit = useMutation(api.attendance.selfSubmit);
  const [busy, setBusy] = useState(false);

  if (profile === undefined || context === undefined || !group || events === undefined || attendance === undefined) return <LoadingState />;

  const eventRows = events as EventRow[];
  const next = eventRows.find((event) => event.endAt + ONE_HOUR >= Date.now());
  const checkInOpen = isAttendanceOpen(next);
  const displayName = profile?.preferredName?.trim() || profile?.fullName?.trim() || 'Member';
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
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: t.accent }]}>HOME</Text>
            <Text style={[styles.title, { color: t.ink }]}>Hi, {firstName(displayName)}.</Text>
            <Text style={[styles.hint, { color: t.muted }]}>{group?.name ?? 'Your cell group'}</Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: t.accent }]}>
            <Text style={[styles.avatarText, { color: t.accentInk }]}>{initials(displayName)}</Text>
          </View>
        </View>

        <GroupSwitcher mode="member" />

        <View style={[styles.nextCard, { backgroundColor: t.accent }]}>
          <View style={styles.heroGlow} />
          <Text style={[styles.nextKicker, { color: t.accentInk }]}>{next ? `${formatDay(next.startAt)} · ${formatTimeRange(next.startAt, next.endAt)}` : 'NO EVENT SCHEDULED'}</Text>
          <Text style={[styles.nextTitle, { color: t.accentInk }]}>{next?.title ?? 'A quiet week for now.'}</Text>
          <Text style={[styles.nextLocation, { color: t.accentInk }]}>{next ? next.venue || next.location || 'Venue TBC' : 'Your next gathering will appear here once scheduled.'}</Text>
          {next ? (
            <Pressable
              onPress={checkIn}
              disabled={!checkInOpen || busy}
              style={({ pressed }) => [
                styles.checkButton,
                { backgroundColor: t.accentInk, opacity: !checkInOpen || busy ? 0.48 : 1, transform: [{ scale: pressed && checkInOpen && !busy ? 0.985 : 1 }] },
              ]}
            >
              <Text style={[styles.checkText, { color: t.accent }]}>{busy ? 'Checking in…' : checkInOpen ? 'Check in now' : 'Check-in opens near event time'}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.quickGrid}>
          <QuickCard title="Schedule" detail={next ? formatDay(next.startAt) : 'No upcoming event'} mark="◆" onPress={() => router.push('/(member-tabs)/schedule')} />
          <QuickCard title="Attendance" detail={`${rate} current rate`} mark="✓" onPress={() => router.push('/(member-tabs)/attendance')} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: t.ink }]}>Recent attendance</Text>
            <Text style={[styles.count, { color: t.muted }]}>{attendance.presentEvents}/{attendance.totalPastEvents}</Text>
          </View>
          {attendance.rows.length > 0 ? (
            <View style={styles.list}>
              {attendance.rows.slice(0, 3).map((row) => (
                <View key={row.event._id} style={[styles.recentRow, { backgroundColor: t.surface, borderColor: t.line }]}>
                  <View style={[styles.recentMark, { backgroundColor: row.status === 'present' ? t.selected : t.soft }]}>
                    <Text style={{ color: row.status === 'present' ? t.success : t.muted, fontFamily: fonts.bodyBold }}>{row.status === 'present' ? '✓' : '—'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recentTitle, { color: t.ink }]}>{row.event.title}</Text>
                    <Text style={[styles.recentMeta, { color: t.muted }]}>{formatDay(row.event.startAt)}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.empty, { backgroundColor: t.surface, borderColor: t.line }]}>
              <Text style={[styles.emptyTitle, { color: t.ink }]}>No attendance yet.</Text>
              <Text style={[styles.emptyText, { color: t.muted }]}>After your first past event, your recent attendance will show here.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickCard({ title, detail, mark, onPress }: { title: string; detail: string; mark: string; onPress: () => void }) {
  const t = useAppTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickCard, { backgroundColor: t.surface, borderColor: t.line, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
      <View style={[styles.quickMark, { backgroundColor: t.soft }]}>
        <Text style={{ color: t.accent, fontFamily: fonts.bodyBold }}>{mark}</Text>
      </View>
      <Text style={[styles.quickTitle, { color: t.ink }]}>{title}</Text>
      <Text style={[styles.quickDetail, { color: t.muted }]}>{detail}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 108 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 2.6 },
  title: { marginTop: 12, fontFamily: fonts.display, fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  hint: { marginTop: 8, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  avatar: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.5 },
  nextCard: { minHeight: 232, borderRadius: 30, padding: 22, overflow: 'hidden', justifyContent: 'flex-end' },
  heroGlow: { position: 'absolute', right: -54, bottom: -68, width: 190, height: 190, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  nextKicker: { opacity: 0.76, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase' },
  nextTitle: { marginTop: 8, fontFamily: fonts.bodyBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.7 },
  nextLocation: { marginTop: 8, opacity: 0.82, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  checkButton: { marginTop: 20, minHeight: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  checkText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, letterSpacing: -0.2 },
  quickGrid: { marginTop: 14, flexDirection: 'row', gap: 10 },
  quickCard: { flex: 1, borderWidth: 1, borderRadius: 22, padding: 15, minHeight: 132 },
  quickMark: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  quickTitle: { fontFamily: fonts.bodyBold, fontSize: 16, letterSpacing: -0.25 },
  quickDetail: { marginTop: 5, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  section: { marginTop: 28 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 18, letterSpacing: -0.3 },
  count: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  list: { gap: 10 },
  recentRow: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  recentMark: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recentTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, letterSpacing: -0.25 },
  recentMeta: { marginTop: 4, fontFamily: fonts.body, fontSize: 13 },
  empty: { borderWidth: 1, borderRadius: 22, padding: 18 },
  emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 17, letterSpacing: -0.25 },
  emptyText: { marginTop: 7, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});

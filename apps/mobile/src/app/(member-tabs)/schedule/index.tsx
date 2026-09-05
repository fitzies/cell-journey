import { useQuery } from 'convex/react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

type EventRow = {
  _id: string;
  title: string;
  location?: string;
  venue?: string;
  word?: string;
  worship?: string;
  remarks?: string;
  startAt: number;
  endAt: number;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatTimeRange(startAt: number, endAt: number) {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${new Intl.DateTimeFormat('en-SG', opts).format(startAt)}–${new Intl.DateTimeFormat('en-SG', opts).format(endAt)}`;
}

function formatDayLabel(ms: number) {
  const date = new Date(ms);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-SG', { weekday: 'long' }).format(date);
}

function formatDateParts(ms: number) {
  const date = new Date(ms);
  return {
    day: new Intl.DateTimeFormat('en-SG', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('en-SG', { month: 'short' }).format(date).toUpperCase(),
    full: new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'long' }).format(date),
  };
}

export default function MemberScheduleScreen() {
  const t = useAppTheme();
  const { context, selectedMemberGroup } = useGroups();
  const group = selectedMemberGroup?.group ?? null;
  const events = useQuery(api.events.listForGroup, group ? { groupId: group._id, from: startOfToday(), limit: 30 } : 'skip');

  if (context === undefined || !group || events === undefined) return <LoadingState />;

  const upcoming = events as EventRow[];
  const next = upcoming[0];
  const rest = upcoming.slice(1);

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppHeader title="Events" mode="member" />
        {next ? <NextEvent event={next} /> : <EmptySchedule />}

        {rest.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: t.ink }]}>Coming up</Text>
              <Text style={[styles.count, { color: t.muted }]}>{rest.length} more</Text>
            </View>
            <View style={styles.list}>
              {rest.map((event) => <EventCard key={event._id} event={event} />)}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function NextEvent({ event }: { event: EventRow }) {
  const t = useAppTheme();
  const date = formatDateParts(event.startAt);
  const people = [event.word ? `Word · ${event.word}` : null, event.worship ? `Worship · ${event.worship}` : null].filter(Boolean).join('   ');
  return (
    <View style={[styles.hero, { backgroundColor: t.accent }]}>
      <View style={styles.heroGlow} />
      <Text style={[styles.heroKicker, { color: t.accentInk }]}>{formatDayLabel(event.startAt)} · {date.full}</Text>
      <Text style={[styles.heroTitle, { color: t.accentInk }]}>{event.title}</Text>
      <View style={styles.heroMetaRow}>
        <View style={styles.heroPill}><Text style={[styles.heroPillText, { color: t.accentInk }]}>○ {formatTimeRange(event.startAt, event.endAt)}</Text></View>
        <View style={styles.heroPill}><Text style={[styles.heroPillText, { color: t.accentInk }]}>⌁ {event.venue || event.location || 'Venue TBC'}</Text></View>
      </View>
      {people ? <Text style={[styles.heroDetails, { color: t.accentInk }]}>{people}</Text> : null}
      {event.remarks ? <Text style={[styles.heroRemarks, { color: t.accentInk }]}>{event.remarks}</Text> : null}
    </View>
  );
}

function EventCard({ event }: { event: EventRow }) {
  const t = useAppTheme();
  const date = formatDateParts(event.startAt);
  const people = [event.word ? `Word · ${event.word}` : null, event.worship ? `Worship · ${event.worship}` : null].filter(Boolean).join('   ');
  return (
    <View style={[styles.card, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
      <View style={[styles.datePill, { backgroundColor: t.soft }]}>
        <Text style={[styles.dateDay, { color: t.ink }]}>{date.day}</Text>
        <Text style={[styles.dateMonth, { color: t.muted }]}>{date.month}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardLabel, { color: t.muted }]}>{formatDayLabel(event.startAt)} · {formatTimeRange(event.startAt, event.endAt)}</Text>
        <Text style={[styles.cardTitle, { color: t.ink }]}>{event.title}</Text>
        <Text style={[styles.cardLocation, { color: t.muted }]} numberOfLines={1}>{event.venue || event.location || 'Venue TBC'}</Text>
        {people ? <Text style={[styles.cardPeople, { color: t.muted }]} numberOfLines={1}>{people}</Text> : null}
        {event.remarks ? <Text style={[styles.cardRemarks, { color: t.ink }]} numberOfLines={2}>{event.remarks}</Text> : null}
      </View>
    </View>
  );
}

function EmptySchedule() {
  const t = useAppTheme();
  return (
    <View style={[styles.empty, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
      <View style={[styles.emptyMark, { backgroundColor: t.soft }]}><Text style={{ color: t.accent, fontFamily: fonts.bodyBold }}>✓</Text></View>
      <Text style={[styles.emptyTitle, { color: t.ink }]}>No gatherings scheduled.</Text>
      <Text style={[styles.emptyText, { color: t.muted }]}>When your leader adds the next cell event, it’ll appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 108 },
  hero: { minHeight: 190, borderRadius: 18, padding: 22, overflow: 'hidden', justifyContent: 'flex-end' },
  heroGlow: { position: 'absolute', right: -54, bottom: -68, width: 190, height: 190, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroKicker: { ...textStyles.body, opacity: 0.76 },
  heroTitle: { ...textStyles.title, marginTop: 7 },
  heroMetaRow: { marginTop: 18, gap: 8, alignItems: 'flex-start' },
  heroPill: { borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.13)', borderColor: 'rgba(255,255,255,0.14)' },
  heroPillText: { fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  heroDetails: { marginTop: 12, opacity: 0.82, fontFamily: fonts.bodySemiBold, fontSize: 12.5, lineHeight: 18 },
  heroRemarks: { ...textStyles.body, marginTop: 5, opacity: 0.82 },
  section: { marginTop: 28 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { ...textStyles.section },
  count: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  list: { gap: 10 },
  card: { borderRadius: 18, padding: 14, flexDirection: 'row', gap: 14, alignItems: 'center' },
  datePill: { width: 52, borderRadius: 16, paddingVertical: 10, alignItems: 'center' },
  dateDay: { fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 21 },
  dateMonth: { marginTop: 4, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.2 },
  cardBody: { flex: 1, minWidth: 0 },
  cardLabel: { ...textStyles.body },
  cardTitle: { marginTop: 5, fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.25 },
  cardLocation: { ...textStyles.body, marginTop: 4 },
  cardPeople: { marginTop: 4, fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
  cardRemarks: { marginTop: 4, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17 },
  empty: { borderRadius: 18, padding: 20, minHeight: 188, justifyContent: 'center' },
  emptyMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { ...textStyles.section },
  emptyText: { ...textStyles.body, marginTop: 8, maxWidth: 280 },
});

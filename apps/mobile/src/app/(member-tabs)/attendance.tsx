import { useQuery } from 'convex/react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

type HistoryRow = {
  event: {
    _id: string;
    title: string;
    location: string;
    startAt: number;
  };
  status: string;
};

function formatPercent(rate: number | null) {
  if (rate === null) return '—';
  return Math.round(rate * 100).toString();
}

function formatEventMeta(ms: number) {
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms);
}

export default function MemberAttendanceScreen() {
  const t = useAppTheme();
  const history = useQuery(api.attendance.myHistory, { limit: 30 });

  if (history === undefined) return <LoadingState />;

  const rows = history.rows as HistoryRow[];
  const rate = formatPercent(history.attendanceRate);
  const hasHistory = history.totalPastEvents > 0;
  const recent = rows.slice(0, 12).reverse();

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: t.accent }]}>ATTENDANCE</Text>
          <Text style={[styles.title, { color: t.ink }]}>Your rhythm so far.</Text>
          <Text style={[styles.hint, { color: t.muted }]}>A simple record of past gatherings during your active membership.</Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: t.surface, borderColor: t.line }]}>
          <View style={styles.statTopRow}>
            <Text style={[styles.statKicker, { color: t.muted }]}>CURRENT RATE</Text>
            <View style={[styles.statBadge, { backgroundColor: t.soft }]}>
              <Text style={[styles.statBadgeText, { color: t.accent }]}>{history.presentEvents}/{history.totalPastEvents}</Text>
            </View>
          </View>
          <View style={styles.rateRow}>
            <Text style={[styles.rate, { color: t.ink }]}>{rate}</Text>
            {history.attendanceRate !== null ? <Text style={[styles.percent, { color: t.muted }]}>%</Text> : null}
          </View>
          <Text style={[styles.statNote, { color: t.muted }]}>Present at {history.presentEvents} of {history.totalPastEvents} past events.</Text>

          {recent.length > 0 ? (
            <View style={styles.trendRow}>
              {recent.map((row, index) => (
                <View
                  key={`${row.event._id}-${index}`}
                  style={[
                    styles.trendBar,
                    { backgroundColor: row.status === 'present' ? t.success : t.soft },
                    row.status !== 'present' ? { borderWidth: 1, borderColor: t.line } : null,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: t.ink }]}>History</Text>
            <Text style={[styles.count, { color: t.muted }]}>{rows.length} shown</Text>
          </View>

          {hasHistory ? (
            <View style={styles.list}>
              {rows.map((row) => <HistoryCard key={row.event._id} row={row} />)}
            </View>
          ) : (
            <EmptyHistory />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HistoryCard({ row }: { row: HistoryRow }) {
  const t = useAppTheme();
  const present = row.status === 'present';
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }]}>
      <View style={[styles.statusMark, { backgroundColor: present ? t.success : t.soft }]}>
        <Text style={{ color: present ? t.accentInk : t.muted, fontFamily: fonts.bodyBold }}>{present ? '✓' : '—'}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardLabel, { color: t.muted }]}>{formatEventMeta(row.event.startAt)}</Text>
        <Text style={[styles.cardTitle, { color: t.ink }]}>{row.event.title}</Text>
        <Text style={[styles.cardLocation, { color: t.muted }]} numberOfLines={1}>{row.event.location}</Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: present ? t.selected : t.soft }]}>
        <Text style={[styles.statusText, { color: present ? t.success : t.muted }]}>{present ? 'Present' : 'Absent'}</Text>
      </View>
    </View>
  );
}

function EmptyHistory() {
  const t = useAppTheme();
  return (
    <View style={[styles.empty, { backgroundColor: t.surface, borderColor: t.line }]}>
      <View style={[styles.emptyMark, { backgroundColor: t.soft }]}><Text style={{ color: t.accent, fontFamily: fonts.bodyBold }}>○</Text></View>
      <Text style={[styles.emptyTitle, { color: t.ink }]}>No attendance yet.</Text>
      <Text style={[styles.emptyText, { color: t.muted }]}>After your first past cell event, your attendance rate and history will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 108 },
  header: { marginBottom: 24 },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 2.6 },
  title: { marginTop: 12, fontFamily: fonts.display, fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  hint: { marginTop: 10, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  statCard: { borderWidth: 1, borderRadius: 28, padding: 22 },
  statTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statKicker: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.8 },
  statBadge: { borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  statBadgeText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  rateRow: { marginTop: 18, flexDirection: 'row', alignItems: 'flex-end' },
  rate: { fontFamily: fonts.display, fontSize: 72, lineHeight: 76, letterSpacing: -2.2 },
  percent: { marginBottom: 12, marginLeft: 4, fontFamily: fonts.bodyBold, fontSize: 24 },
  statNote: { marginTop: 4, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  trendRow: { marginTop: 22, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  trendBar: { flex: 1, height: 34, borderRadius: 9 },
  section: { marginTop: 28 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 18, letterSpacing: -0.3 },
  count: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  list: { gap: 10 },
  card: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  statusMark: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0 },
  cardLabel: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase' },
  cardTitle: { marginTop: 5, fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.25 },
  cardLocation: { marginTop: 4, fontFamily: fonts.body, fontSize: 13.5 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  empty: { borderWidth: 1, borderRadius: 24, padding: 20, minHeight: 188, justifyContent: 'center' },
  emptyMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 19, letterSpacing: -0.3 },
  emptyText: { marginTop: 8, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, maxWidth: 290 },
});

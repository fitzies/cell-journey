import { useQuery } from 'convex/react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

type HistoryRow = {
  event: {
    _id: string;
    title: string;
    location?: string;
    venue?: string;
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
  const { context, selectedMemberGroup } = useGroups();
  const group = selectedMemberGroup?.group ?? null;
  const history = useQuery(api.attendance.historyForGroup, group ? { groupId: group._id, limit: 30 } : 'skip');

  if (context === undefined || !group || history === undefined) return <LoadingState />;

  const rows = history.rows as HistoryRow[];
  const rate = formatPercent(history.attendanceRate);
  const hasHistory = history.totalPastEvents > 0;
  const recent = rows.slice(0, 12).reverse();

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppHeader title="Attendance" mode="member" />
        <View style={[styles.statCard, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
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
          {recent.length > 0 ? (
            <View style={styles.trendRow}>
              {recent.map((row, index) => (
                <View
                  key={`${row.event._id}-${index}`}
                  style={[
                    styles.trendBar,
                    { backgroundColor: row.status === 'present' ? t.success : t.soft },
                    row.status !== 'present' ? { borderColor: t.line } : null,
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
    <View style={[styles.card, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
      <View style={[styles.statusMark, { backgroundColor: present ? t.success : t.soft }]}>
        <Text style={{ color: present ? t.accentInk : t.muted, fontFamily: fonts.bodyBold }}>{present ? '✓' : '—'}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardLabel, { color: t.muted }]}>{formatEventMeta(row.event.startAt)}</Text>
        <Text style={[styles.cardTitle, { color: t.ink }]}>{row.event.title}</Text>
        <Text style={[styles.cardLocation, { color: t.muted }]} numberOfLines={1}>{row.event.venue || row.event.location || 'Venue TBC'}</Text>
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
    <View style={[styles.empty, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
      <View style={[styles.emptyMark, { backgroundColor: t.soft }]}><Text style={{ color: t.accent, fontFamily: fonts.bodyBold }}>○</Text></View>
      <Text style={[styles.emptyTitle, { color: t.ink }]}>No attendance yet.</Text>
      <Text style={[styles.emptyText, { color: t.muted }]}>After your first past cell event, your attendance rate and history will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 108 },
  statCard: { borderRadius: 18, padding: 22 },
  statTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statKicker: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.8 },
  statBadge: { borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  statBadgeText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  rateRow: { marginTop: 18, flexDirection: 'row', alignItems: 'flex-end' },
  rate: { fontFamily: fonts.display, fontSize: 72, lineHeight: 76, letterSpacing: -2.2 },
  percent: { marginBottom: 12, marginLeft: 4, fontFamily: fonts.bodyBold, fontSize: 24 },
  trendRow: { marginTop: 22, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  trendBar: { flex: 1, height: 34, borderRadius: 9 },
  section: { marginTop: 28 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { ...textStyles.section },
  count: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  list: { gap: 10 },
  card: { borderRadius: 18, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  statusMark: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0 },
  cardLabel: { ...textStyles.body },
  cardTitle: { marginTop: 5, fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.25 },
  cardLocation: { ...textStyles.body, marginTop: 4 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  empty: { borderRadius: 18, padding: 20, minHeight: 188, justifyContent: 'center' },
  emptyMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { ...textStyles.section },
  emptyText: { ...textStyles.body, marginTop: 8, maxWidth: 290 },
});

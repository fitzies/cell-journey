import { useQuery } from 'convex/react';
import { StyleSheet, Text, View } from 'react-native';
import { useGroups } from '@/components/group-context';
import { MemberEmptyState, MemberHistoryRow, MemberScreen, MemberSection } from '@/components/member/ui';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

export default function MemberAttendanceScreen() {
  const t = useAppTheme();
  const { context, selectedMemberGroup } = useGroups();
  const group = selectedMemberGroup?.group ?? null;
  const history = useQuery(api.attendance.historyForGroup, group ? { groupId: group._id, limit: 30 } : 'skip');

  if (context === undefined || !group || history === undefined) return <LoadingState />;

  const rows = history.rows;
  const rate = history.attendanceRate === null ? '—' : `${Math.round(history.attendanceRate * 100)}%`;
  const recent = rows.slice(0, 12).reverse();

  return (
    <MemberScreen title="Attendance">
      <Text style={[styles.group, { color: t.muted }]}>{group.name}</Text>
      <View style={[styles.statCard, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
        <View style={styles.statTopRow}>
          <View style={styles.statCopy}>
            <Text style={[styles.statLabel, { color: t.text }]}>Attendance rate</Text>
            <Text style={[styles.statDetail, { color: t.muted }]}>{history.presentEvents} of {history.totalPastEvents} gatherings attended</Text>
          </View>
          <Text style={[styles.rate, { color: t.text }]}>{rate}</Text>
        </View>
        {recent.length ? (
          <View style={[styles.trend, { borderTopColor: t.track }]}>
            <View style={styles.trendRow} accessible accessibilityLabel={`Last ${recent.length} gatherings, oldest to newest: ${recent.map(row => row.status === 'present' ? 'present' : 'absent').join(', ')}`}>
              {recent.map(row => <View key={row.event._id} style={[styles.trendBar, { backgroundColor: row.status === 'present' ? t.success : t.track }]} />)}
            </View>
            <View style={styles.trendLabels}>
              <Text style={[styles.caption, { color: t.muted }]}>Last {recent.length} {recent.length === 1 ? 'gathering' : 'gatherings'}</Text>
              <Text style={[styles.caption, { color: t.muted }]}>Most recent →</Text>
            </View>
          </View>
        ) : null}
      </View>

      <MemberSection title="History" action={<Text style={[styles.caption, { color: t.muted }]}>{rows.length} shown</Text>}>
        {history.totalPastEvents > 0 ? (
          <View style={[styles.history, { borderTopColor: t.track }]}>
            {rows.map(row => <MemberHistoryRow key={row.event._id} event={row.event} status={row.status} location />)}
          </View>
        ) : <MemberEmptyState title="No attendance yet" body="After your first past cell event, your attendance rate and history will appear here." />}
      </MemberSection>
    </MemberScreen>
  );
}

const styles = StyleSheet.create({
  group: { ...textStyles.body, marginTop: 6 },
  statCard: { marginTop: 27, borderRadius: radius.lg, borderCurve: 'continuous', padding: 18 },
  statTopRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statCopy: { flex: 1, minWidth: 0 },
  statLabel: { ...textStyles.body, fontFamily: fonts.bodySemiBold, letterSpacing: -0.3 },
  statDetail: { ...textStyles.body, marginTop: 5 },
  rate: { fontFamily: fonts.bodySemiBold, fontSize: 34, lineHeight: 38, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  trend: { marginTop: 18, paddingTop: 18, borderTopWidth: 1 },
  trendRow: { flexDirection: 'row', gap: 6 },
  trendBar: { flex: 1, height: 8, borderRadius: radius.pill },
  trendLabels: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  history: { borderTopWidth: 1 },
});

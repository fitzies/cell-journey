import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, EmptyState, LeaderScreen } from '@/components/leader/ui';
import { LeaderConnectionNotice, LeaderLoadingState } from '@/components/leader/query-state';
import { LEADER_EVENT_PAGE_SIZE, useLeaderTabEvents } from '@/components/leader/use-tab-events';
import { fonts, textStyles, useAppTheme } from '@/constants/tokens';

const eventDate = new Intl.DateTimeFormat('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function LeaderAttendanceList() {
  const t = useAppTheme();
  const { context, group, results, status, loadMore } = useLeaderTabEvents('started');
  if (context === undefined || (group && status === 'LoadingFirstPage')) {
    return <LeaderLoadingState title="Attendance" label="Loading events…" />;
  }

  return <LeaderScreen title="Attendance">
    <LeaderConnectionNotice />
    {!group ? <EmptyState title="No group assigned." body="Once assigned, your gatherings will appear here." />
      : <>
        {results.map((event) => <View key={event._id} style={[styles.row, { borderBottomColor: t.line }]}>
          <View style={styles.copy}>
            <Text style={[styles.date, { color: t.muted }]}>{eventDate.format(event.startAt)}</Text>
            <Text style={[styles.title, { color: t.ink }]}>{event.title}</Text>
          </View>
          <View style={styles.action}>
            <ActionButton filled muted={event.attendanceComplete} label={event.attendanceComplete ? 'Marked' : group.capabilities.markAttendance ? 'Mark attendance' : 'View attendance'}
              onPress={() => router.push({ pathname: '/(leader-tabs)/attendance/[eventId]', params: { eventId: event._id } })} />
          </View>
        </View>)}
        {!results.length && status === 'Exhausted' ? <EmptyState title="No attendance to mark yet." body="Events appear here when they start." /> : null}
        {status === 'CanLoadMore' || status === 'LoadingMore' ? <View style={styles.loadMore}>
          <ActionButton label={status === 'LoadingMore' ? 'Loading…' : 'Older events'} disabled={status === 'LoadingMore'} onPress={() => loadMore(LEADER_EVENT_PAGE_SIZE)} />
        </View> : null}
      </>}
  </LeaderScreen>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  copy: { flex: 1, minWidth: 0, gap: 6 },
  date: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  title: { ...textStyles.body, fontFamily: fonts.bodySemiBold },
  action: { flexShrink: 0, maxWidth: '55%' },
  loadMore: { marginTop: 20 },
});

import { useQuery } from 'convex/react';
import { Component, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, textStyles, useAppTheme } from '@/constants/tokens';
import { api, type Id } from '@/lib/api';
import { AttendanceBarChartView } from './attendance-bar-chart';
import { AttendanceStatCards } from './attendance-stat-cards';
import { useAttendanceNow } from './attendance-heatmap';

// Leader Home "Group attendance": stat cards above the year chart, both fed
// by one `attendanceHeatmap.forYear` subscription.
export function AttendanceOverview({ groupId }: { groupId: Id<'groups'> }) {
  return <OverviewBoundary key={groupId}><ConnectedOverview groupId={groupId} /></OverviewBoundary>;
}

function ConnectedOverview({ groupId }: { groupId: Id<'groups'> }) {
  const now = useAttendanceNow();
  const data = useQuery(api.attendanceHeatmap.forYear, { groupId, now });
  const t = useAppTheme();
  if (!data) {
    return <View style={[styles.placeholder, { backgroundColor: t.surface }]}>
      <ActivityIndicator color={t.muted} accessibilityLabel="Loading attendance" />
    </View>;
  }
  return <View style={styles.stack}>
    <AttendanceStatCards summary={data.summary} />
    <AttendanceBarChartView data={data} />
  </View>;
}

class OverviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <OverviewError retry={() => this.setState({ failed: false })} /> : this.props.children;
  }
}

function OverviewError({ retry }: { retry: () => void }) {
  const t = useAppTheme();
  return <View style={[styles.error, { backgroundColor: t.surface }]}>
    <Text style={[textStyles.body, { color: t.muted }]}>Couldn&apos;t load attendance.</Text>
    <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
      <Text style={[textStyles.button, { color: t.ink }]}>Try again</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  placeholder: { minHeight: 280, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  error: { padding: 16, borderRadius: radius.xl, gap: 4 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});

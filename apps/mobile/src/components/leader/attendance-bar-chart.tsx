import { useQuery } from 'convex/react';
import { Component, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, palettes, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { api, type Id } from '@/lib/api';
import { dayLabel, percent, useAttendanceNow, type HeatmapData } from './attendance-heatmap';

// Daily bars for the last 3 months (90 days), oldest → newest. Shares the
// heatmap query so data semantics stay identical: a rate only exists when
// every event that day is complete. Event days render green by rate;
// event days without a rate render as a hollow outline (incomplete);
// days without events render as a short baseline tick (never 0%).
export function AttendanceBarChart({ groupId }: { groupId: Id<'groups'> }) {
  return <ChartBoundary key={groupId}><ConnectedChart groupId={groupId} /></ChartBoundary>;
}

function ConnectedChart({ groupId }: { groupId: Id<'groups'> }) {
  const now = useAttendanceNow();
  const data = useQuery(api.attendanceHeatmap.forGroup, { groupId, now });
  const t = useAppTheme();
  if (!data) return <View style={[styles.card, { backgroundColor: t.surface }]}><ActivityIndicator color={t.muted} accessibilityLabel="Loading attendance chart" /></View>;
  return <AttendanceBarChartView data={data} />;
}

// Green belongs only to the attendance scale, independent of the app's action
// accent. Same two stops per band approach as the heatmap ramps.
const scale = {
  light: ['#67B981', '#329357', '#137333'],
  dark: ['#327B4D', '#40A367', '#58C884'],
};

type BarPoint = {
  key: string;
  startAt: number;
  hasEvents: boolean;
  rate: number | null;
  present: number;
  required: number;
  incomplete: boolean;
};

function barColor(rate: number, dark: boolean) {
  const ramp = dark ? scale.dark : scale.light;
  if (rate >= 0.8) return ramp[2];
  if (rate >= 0.65) return ramp[1];
  return ramp[0];
}

export function AttendanceBarChartView({ data }: { data: HeatmapData }) {
  const t = useAppTheme();
  const dark = t === palettes.dark;
  const [width, setWidth] = useState(0);
  const points: BarPoint[] = data.days.map(day => ({
    key: `${day.date}-${day.startAt}`,
    startAt: day.startAt,
    hasEvents: day.events.length > 0,
    rate: day.rate,
    present: day.present,
    required: day.required,
    incomplete: day.events.some(event => !event.complete),
  }));
  const gap = 2;
  const chartHeight = 168;
  const labelHeight = 14;
  const barsWidth = Math.max(0, width - 32);
  const barWidth = points.length ? Math.max(1, (barsWidth - gap * (points.length - 1)) / points.length) : 0;
  const monthAt = (startAt: number) => new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', month: 'short' }).format(startAt).replace('Sept', 'Sep');
  const monthTicks = points.filter((point, i) => i === 0 || monthAt(point.startAt) !== monthAt(points[i - 1].startAt));
  const hasEvents = points.some(point => point.hasEvents);
  return <View style={[styles.card, { backgroundColor: t.surface, ...surfaceShadow(t) }]} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {hasEvents ? <>
      <View style={[styles.plot, { height: chartHeight }]} accessible accessibilityLabel="Daily attendance for the last 3 months, oldest to newest.">
        <View style={[styles.baseline, { backgroundColor: t.track }]} />
        {points.map(point => {
          const fillHeight = point.rate === null ? 0 : Math.max(2, Math.round(point.rate * (chartHeight - labelHeight - 8)));
          const label = !point.hasEvents
            ? `${dayLabel(point.startAt)}. No gathering`
            : point.rate === null
              ? `${dayLabel(point.startAt)}. ${point.required === 0 ? 'No eligible members' : `${point.present} of ${point.required} marked. Attendance incomplete`}`
              : `${dayLabel(point.startAt)}. ${percent(point.rate)} attendance, ${point.present} of ${point.required} present`;
          return <View key={point.key} style={[styles.column, { width: barWidth }]} accessible accessibilityRole="text" accessibilityLabel={label}>
            {point.rate !== null && !point.incomplete
              ? <View style={[styles.bar, { width: barWidth, height: fillHeight, backgroundColor: barColor(point.rate, dark) }]} />
              : point.hasEvents
                ? <View style={[styles.incomplete, { width: barWidth, height: Math.max(fillHeight, 24), borderColor: t.muted }]} />
                : <View style={[styles.empty, { width: barWidth, backgroundColor: t.muted }]} />}
          </View>;
        })}
      </View>
      <View style={styles.months} accessible accessibilityLabel={`Months shown: ${monthTicks.map(point => monthAt(point.startAt)).join(', ')}`}>
        {monthTicks.map(point => <Text key={point.key} style={[styles.day, { color: t.muted }]}>{monthAt(point.startAt)}</Text>)}
      </View>
    </> : <Text style={[textStyles.body, { color: t.muted }]}>No gatherings yet. Bars appear here after your first event.</Text>}
  </View>;
}

class ChartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <ChartError retry={() => this.setState({ failed: false })} /> : this.props.children;
  }
}
function ChartError({ retry }: { retry: () => void }) {
  const t = useAppTheme();
  return <View style={[styles.card, { backgroundColor: t.surface }]}><Text style={[textStyles.body, { color: t.muted }]}>Couldn&apos;t load attendance.</Text><Pressable accessibilityRole="button" onPress={retry} style={styles.detailsLink}><Text style={[textStyles.button, { color: t.ink }]}>Try again</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: radius.xl, gap: 10 },
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, paddingTop: 8 },
  baseline: { position: 'absolute', left: 0, right: 0, bottom: 0.5, height: StyleSheet.hairlineWidth },
  column: { alignItems: 'center', justifyContent: 'flex-end' },
  bar: { borderRadius: 1.5, minHeight: 2 },
  incomplete: { borderRadius: 1.5, borderWidth: 1, borderStyle: 'dashed' },
  empty: { height: 2, borderRadius: 1, opacity: 0.4 },
  months: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { fontFamily: fonts.bodyMedium, fontSize: 10, lineHeight: 14 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  detailsLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 6 },
});

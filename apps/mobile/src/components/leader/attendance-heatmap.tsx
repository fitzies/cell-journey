import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, palettes, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { api, type Id } from '@/lib/api';

export type HeatmapData = FunctionReturnType<typeof api.attendanceHeatmap.forGroup>;
export type HeatmapDay = HeatmapData['days'][number];
export const percent = (rate: number) => `${Math.round(rate * 100)}%`;
export const dayLabel = (startAt: number) => new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', weekday: 'long', day: 'numeric', month: 'long',
}).format(startAt);

export function useAttendanceNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const update = () => setNow(Math.floor(Date.now() / 60_000) * 60_000);
    const timer = setInterval(update, 60_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  return now;
}

export function AttendanceHeatmap({ groupId }: { groupId: Id<'groups'> }) {
  return <ChartBoundary key={groupId}><ConnectedChart groupId={groupId} /></ChartBoundary>;
}

function ConnectedChart({ groupId }: { groupId: Id<'groups'> }) {
  const now = useAttendanceNow();
  const data = useQuery(api.attendanceHeatmap.forGroup, { groupId, now });
  const t = useAppTheme();
  if (!data) return <View style={[styles.card, { backgroundColor: t.surface }]}><ActivityIndicator color={t.muted} accessibilityLabel="Loading attendance chart" /></View>;
  return <AttendanceHeatmapChart data={data} />;
}

// Green belongs only to the attendance scale, independent of the app's action accent.
const scale = {
  light: ['#DAEEDD', '#A5D9B2', '#67B981', '#329357', '#137333'],
  dark: ['#203C2B', '#28583C', '#327B4D', '#40A367', '#58C884'],
};

export function AttendanceHeatmapChart({ data }: { data: HeatmapData }) {
  const t = useAppTheme();
  const greens = t === palettes.dark ? scale.dark : scale.light;
  const [width, setWidth] = useState(0);
  const offset = (new Date(data.days[0].startAt + 8 * 3_600_000).getUTCDay() + 6) % 7;
  const daysPerRow = 14;
  const rowCount = Math.ceil((offset + data.days.length) / daysPerRow);
  const cell = Math.max(1, Math.min(26, Math.floor((width - 42 - (daysPerRow - 1) * 3) / daysPerRow)));
  const rows = Array.from({ length: rowCount }, (_, row) => Array.from({ length: daysPerRow }, (_, day) => data.days[row * daysPerRow + day - offset]));
  const month = (day: HeatmapDay) => new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', month: 'short' }).format(day.startAt);
  return <View style={[styles.card, { backgroundColor: t.surface, ...surfaceShadow(t) }]} onLayout={event => setWidth(event.nativeEvent.layout.width - 32)}>
    <View style={{ gap: 3, alignSelf: 'center' }}>
      <View accessible={false} style={{ flexDirection: 'row', gap: 3, paddingLeft: 42 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S', 'M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => <Text key={i} style={[styles.weekday, { width: cell, textAlign: 'center', color: t.muted }]}>{label}</Text>)}
      </View>
      {rows.map((row, i) => {
        const first = row.find(Boolean);
        const previous = rows[i - 1]?.find(Boolean);
        const label = first && (!previous || month(first) !== month(previous)) ? month(first) : '';
        return <View key={i} style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
          <Text style={[styles.month, { color: t.muted, width: 39 }]}>{label.replace('Sept', 'Sep')}</Text>
          {row.map((day, j) => {
            const hasEvents = Boolean(day?.events.length);
            const pending = hasEvents && day.events.some(event => !event.complete);
            const fill = day?.rate === null || !day ? t.soft : greens[Math.min(4, Math.floor(day.rate * 5))];
            const tile = { width: cell, height: cell, borderRadius: 4, backgroundColor: fill, borderWidth: pending ? 1.5 : 0, borderColor: t.muted, opacity: day ? 1 : 0 };
            if (!hasEvents) return <View key={j} accessible={false} style={tile} />;
            return <View key={j} accessible accessibilityRole="text" accessibilityLabel={`${dayLabel(day.startAt)}. ${day.rate === null ? `${day.marked} of ${day.required} marked. ${pending ? 'Attendance incomplete' : 'No eligible members'}` : `${percent(day.rate)} attendance, ${day.present} of ${day.required} present`}`} style={tile} />;
          })}
        </View>;
      })}
    </View>
    <View style={styles.legend} accessible accessibilityLabel="Attendance scale from 0 to 100 percent. Outlined squares mean incomplete attendance. Gray squares mean no attendance rate.">
      <Text style={[styles.caption, { color: t.muted }]}>0%</Text>
      {greens.map(color => <View key={color} style={[styles.swatch, { backgroundColor: color }]} />)}
      <Text style={[styles.caption, { color: t.muted }]}>100%</Text>
      <View style={[styles.swatch, { marginLeft: 8, borderWidth: 1.5, borderColor: t.muted }]} />
      <Text style={[styles.caption, { color: t.muted }]}>Incomplete</Text>
    </View>
    {data.pendingEvents > 0 ? <Text style={[styles.caption, { color: t.muted, marginTop: 8 }]}>{data.pendingEvents} {data.pendingEvents === 1 ? 'event awaits' : 'events await'} completed attendance.</Text> : null}
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
  card: { padding: 16, borderRadius: radius.xl },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  weekday: { fontFamily: fonts.bodyMedium, fontSize: 10 },
  month: { height: 19, width: 36, fontFamily: fonts.bodyMedium, fontSize: 10 },
  legend: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  detailsLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 6 },
});

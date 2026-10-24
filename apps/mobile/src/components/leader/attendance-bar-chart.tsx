import type { FunctionReturnType } from 'convex/server';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme, type AppTheme } from '@/constants/tokens';
import type { api } from '@/lib/api';
import { dayLabel, percent } from './attendance-heatmap';

export type AttendanceYearData = FunctionReturnType<typeof api.attendanceHeatmap.forYear>;
type YearEvent = AttendanceYearData['events'][number];

const SINGAPORE_OFFSET = 8 * 3_600_000;
const PLOT_HEIGHT = 140;
const Y_AXIS_WIDTH = 34;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GRID = [1, 0.5, 0];

export const shortDate = (startAt: number) => new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', day: 'numeric', month: 'short',
}).format(startAt).replace('Sept', 'Sep');

function barLabel(event: YearEvent) {
  const when = `${dayLabel(event.startAt)}, ${event.title}`;
  if (event.required === 0) return `${when}. No eligible members`;
  if (event.rate === null) return `${when}. ${event.marked} of ${event.required} marked, ${event.present} present. Attendance incomplete`;
  return `${when}. ${event.present} of ${event.required} present, ${percent(event.rate)}`;
}

// Screen Time–style year chart: one thin bar per gathering placed at its date
// on a Jan → Dec axis. Complete events are filled to their rate; events still
// being marked render as a hollow dashed outline (never as 0%).
export function AttendanceBarChartView({ data }: { data: AttendanceYearData }) {
  const t = useAppTheme();
  const [width, setWidth] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.events.find(event => event.eventId === selectedId) ?? null;
  const average = data.summary.rate;
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH);
  const span = data.to - data.from;
  const xAt = (at: number) => ((at - data.from) / span) * plotWidth;
  const barWidth = Math.min(6, Math.max(3, plotWidth / 75));
  const monthStarts = MONTHS.map((_, month) => Date.UTC(data.year, month, 1) - SINGAPORE_OFFSET);
  const monthWidth = plotWidth / 12;
  const avgY = average === null ? null : PLOT_HEIGHT * (1 - average);
  const hasIncomplete = data.events.some(event => event.rate === null && event.required > 0);

  return <View style={[styles.card, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
    <Headline t={t} data={data} selected={selected} onClear={() => setSelectedId(null)} />
    {data.events.length === 0 ? (
      <Text style={[textStyles.body, { color: t.muted }]}>No gatherings yet this year. Bars appear here after your first event.</Text>
    ) : <>
      <View style={{ height: PLOT_HEIGHT }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? <>
          {GRID.map(value => {
            const y = PLOT_HEIGHT * (1 - value);
            const nearAvg = avgY !== null && Math.abs(avgY - y) < 12;
            return <View key={value} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {value > 0 ? <View style={[styles.grid, { top: y, width: plotWidth, backgroundColor: t.line }]} /> : null}
              {nearAvg ? null : <Text style={[styles.yLabel, { top: y - 7, left: plotWidth + 6, color: t.muted }]}>{percent(value)}</Text>}
            </View>;
          })}
          {avgY !== null ? <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <DashedLine top={avgY} width={plotWidth} color={t.secondary} />
            <Text style={[styles.yLabel, styles.avgLabel, { top: avgY - 7, left: plotWidth + 6, color: t.primary }]}>avg</Text>
          </View> : null}
          {data.events.map(event => {
            const isSelected = selected?.eventId === event.eventId;
            const left = Math.min(Math.max(0, xAt(event.startAt) - barWidth / 2), plotWidth - barWidth);
            return <Pressable
              key={event.eventId}
              accessibilityRole="button"
              accessibilityLabel={barLabel(event)}
              accessibilityHint="Shows this gathering above the chart"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelectedId(isSelected ? null : event.eventId)}
              hitSlop={{ left: 3, right: 3, top: 0, bottom: 12 }}
              style={[styles.column, { left, width: barWidth, opacity: selected && !isSelected ? 0.35 : 1 }]}
            >
              <Bar event={event} width={barWidth} t={t} />
            </Pressable>;
          })}
        </> : null}
        <View style={[styles.axis, { width: plotWidth || '100%', backgroundColor: t.muted }]} />
      </View>
      <View style={styles.months} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {monthStarts.map((start, month) => <View key={month} style={[styles.month, { left: xAt(start), width: monthWidth }]}>
          <View style={[styles.tick, { backgroundColor: t.muted }]} />
          <Text style={[styles.monthLabel, { color: t.muted }]} numberOfLines={1}>
            {monthWidth >= 24 ? MONTHS[month] : MONTHS[month][0]}
          </Text>
        </View>)}
      </View>
      {hasIncomplete ? <View style={styles.legend} accessible accessibilityLabel="Outlined bars are gatherings with attendance not fully marked">
        <View style={[styles.legendSwatch, { borderColor: t.muted }]} />
        <Text style={[styles.legendText, { color: t.muted }]}>Attendance not fully marked</Text>
      </View> : null}
    </>}
  </View>;
}

function Headline({ t, data, selected, onClear }: { t: AppTheme; data: AttendanceYearData; selected: YearEvent | null; onClear: () => void }) {
  if (selected) {
    const value = selected.rate !== null ? percent(selected.rate) : selected.required === 0 ? '—' : `${selected.marked}/${selected.required}`;
    const detail = selected.required === 0
      ? 'No eligible members'
      : selected.rate !== null
        ? `${selected.present} of ${selected.required} present`
        : `marked · ${selected.present} present so far`;
    return <Pressable accessibilityRole="button" accessibilityLabel={`${selected.title}, ${shortDate(selected.startAt)}. ${detail}. Clear selection`} onPress={onClear} style={styles.headline}>
      <Text style={[styles.caption, { color: t.muted }]} numberOfLines={1}>{shortDate(selected.startAt)} · {selected.title}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: t.ink }]}>{value}</Text>
        <Text style={[styles.valueDetail, { color: t.muted }]} numberOfLines={1}>{detail}</Text>
      </View>
    </Pressable>;
  }
  const count = data.summary.completedEvents;
  return <View style={styles.headline} accessible accessibilityLabel={data.summary.rate === null
    ? `Average attendance ${data.year}: not available yet`
    : `Average attendance ${data.year}: ${percent(data.summary.rate)} across ${count} ${count === 1 ? 'gathering' : 'gatherings'}`}>
    <Text style={[styles.caption, { color: t.muted }]}>Average attendance · {data.year}</Text>
    <View style={styles.valueRow}>
      <Text style={[styles.value, { color: t.ink }]}>{data.summary.rate === null ? '—' : percent(data.summary.rate)}</Text>
      <Text style={[styles.valueDetail, { color: t.muted }]} numberOfLines={1}>
        {count ? `across ${count} ${count === 1 ? 'gathering' : 'gatherings'}` : data.events.length ? 'once attendance is marked' : ''}
      </Text>
    </View>
  </View>;
}

function Bar({ event, width, t }: { event: YearEvent; width: number; t: AppTheme }) {
  const corner = { borderTopLeftRadius: width / 2, borderTopRightRadius: width / 2 };
  if (event.required === 0) return <View style={[styles.stub, { width, backgroundColor: t.muted }]} />;
  if (event.rate === null) {
    const height = Math.max(16, Math.round((event.present / event.required) * PLOT_HEIGHT));
    return <View style={[styles.hollow, corner, { width, height, borderColor: t.muted }]} />;
  }
  if (event.rate === 0) return <View style={[styles.stub, { width, backgroundColor: t.primary }]} />;
  return <View style={[corner, { width, height: Math.max(3, Math.round(event.rate * PLOT_HEIGHT)), backgroundColor: t.primary }]} />;
}

function DashedLine({ top, width, color }: { top: number; width: number; color: string }) {
  const count = Math.max(0, Math.floor(width / 6));
  return <View style={[styles.dashes, { top: top - 0.75, width }]}>
    {Array.from({ length: count }, (_, i) => <View key={i} style={[styles.dash, { backgroundColor: color }]} />)}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: radius.xl, gap: 12 },
  headline: { gap: 2 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  value: { fontFamily: fonts.bodyBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  valueDetail: { flexShrink: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  grid: { position: 'absolute', left: 0, height: StyleSheet.hairlineWidth },
  yLabel: { position: 'absolute', fontFamily: fonts.body, fontSize: 10, lineHeight: 14, fontVariant: ['tabular-nums'] },
  avgLabel: { fontFamily: fonts.bodySemiBold },
  dashes: { position: 'absolute', left: 0, height: 1.5, flexDirection: 'row', gap: 3, overflow: 'hidden' },
  dash: { width: 3, height: 1.5, borderRadius: 1 },
  column: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'flex-end' },
  stub: { height: 2, borderRadius: 1 },
  hollow: { borderWidth: 1, borderStyle: 'dashed' },
  axis: { position: 'absolute', left: 0, bottom: 0, height: 1 },
  months: { height: 18 },
  month: { position: 'absolute', top: 0, flexDirection: 'row' },
  tick: { width: 1, height: 5 },
  monthLabel: { marginLeft: 3, marginTop: 2, fontFamily: fonts.bodyMedium, fontSize: 10, lineHeight: 14 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 6, height: 12, borderWidth: 1, borderStyle: 'dashed', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  legendText: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14 },
});

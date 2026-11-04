import type { FunctionReturnType } from 'convex/server';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme, type AppTheme } from '@/constants/tokens';
import type { api } from '@/lib/api';
import { dayLabel } from './attendance-heatmap';

export type AttendanceYearData = FunctionReturnType<typeof api.attendanceHeatmap.forYear>;
type YearEvent = AttendanceYearData['events'][number];

const SINGAPORE_OFFSET = 8 * 3_600_000;
const PLOT_HEIGHT = 140;
const Y_AXIS_WIDTH = 34;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GRID = [1, 0.5, 0];

// Whole numbers stay whole; averages keep one decimal (e.g. 11.4).
const formatCount = (value: number) => String(Math.round(value * 10) / 10);

export const shortDate = (startAt: number) => new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', day: 'numeric', month: 'short',
}).format(startAt).replace('Sept', 'Sep');

function barLabel(event: YearEvent) {
  const when = `${dayLabel(event.startAt)}, ${event.title}`;
  if (event.required === 0) return `${when}. No eligible members`;
  if (event.rate === null) return `${when}. ${event.present} present so far, ${event.marked} of ${event.required} marked. Attendance incomplete`;
  return `${when}. ${event.present} of ${event.required} present`;
}

// Screen Time–style year chart: one thin bar per gathering placed at its date
// on a Jan → Dec axis. Bar height is the number of people present. Events
// still being marked render as a solid grey bar of the count so far.
export function AttendanceBarChartView({ data }: { data: AttendanceYearData }) {
  const t = useAppTheme();
  const [width, setWidth] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.events.find(event => event.eventId === selectedId) ?? null;
  const complete = data.events.filter(event => event.rate !== null);
  const average = complete.length ? complete.reduce((sum, event) => sum + event.present, 0) / complete.length : null;
  // Even ceiling keeps the midline label a whole number.
  const scaleMax = Math.max(2, Math.ceil(Math.max(0, ...data.events.map(event => event.present)) / 2) * 2);
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH);
  const span = data.to - data.from;
  const xAt = (at: number) => ((at - data.from) / span) * plotWidth;
  const barWidth = Math.min(6, Math.max(3, plotWidth / 75));
  const monthStarts = MONTHS.map((_, month) => Date.UTC(data.year, month, 1) - SINGAPORE_OFFSET);
  const monthWidth = plotWidth / 12;
  const avgY = average === null ? null : PLOT_HEIGHT * (1 - average / scaleMax);
  const hasIncomplete = data.events.some(event => event.rate === null && event.required > 0);

  return <View style={[styles.card, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
    <Headline t={t} data={data} average={average} selected={selected} onClear={() => setSelectedId(null)} />
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
              {nearAvg ? null : <Text style={[styles.yLabel, { top: y - 7, left: plotWidth + 6, color: t.muted }]}>{value * scaleMax}</Text>}
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
              <Bar event={event} width={barWidth} scaleMax={scaleMax} t={t} />
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
      {hasIncomplete ? <View style={styles.legend} accessible accessibilityLabel="Grey bars are gatherings with attendance not fully marked">
        <View style={[styles.legendSwatch, { backgroundColor: t.muted }]} />
        <Text style={[styles.legendText, { color: t.muted }]}>Attendance not fully marked</Text>
      </View> : null}
    </>}
  </View>;
}

function Headline({ t, data, average, selected, onClear }: { t: AppTheme; data: AttendanceYearData; average: number | null; selected: YearEvent | null; onClear: () => void }) {
  if (selected) {
    const value = selected.required === 0 ? '—' : String(selected.present);
    const detail = selected.required === 0
      ? 'No eligible members'
      : selected.rate !== null
        ? `of ${selected.required} present`
        : `present so far · ${selected.marked}/${selected.required} marked`;
    return <Pressable accessibilityRole="button" accessibilityLabel={`${selected.title}, ${shortDate(selected.startAt)}. ${value} ${detail}. Clear selection`} onPress={onClear} style={styles.headline}>
      <Text style={[styles.caption, { color: t.muted }]} numberOfLines={1}>{shortDate(selected.startAt)} · {selected.title}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: t.ink }]}>{value}</Text>
        <Text style={[styles.valueDetail, { color: t.muted }]} numberOfLines={1}>{detail}</Text>
      </View>
    </Pressable>;
  }
  const count = data.summary.completedEvents;
  const gatherings = `${count} ${count === 1 ? 'gathering' : 'gatherings'}`;
  return <View style={styles.headline} accessible accessibilityLabel={average === null
    ? `Average attendance ${data.year}: not available yet`
    : `Average attendance ${data.year}: ${formatCount(average)} people per gathering across ${gatherings}`}>
    <Text style={[styles.caption, { color: t.muted }]}>Average attendance · {data.year}</Text>
    <View style={styles.valueRow}>
      <Text style={[styles.value, { color: t.ink }]}>{average === null ? '—' : formatCount(average)}</Text>
      <Text style={[styles.valueDetail, { color: t.muted }]} numberOfLines={1}>
        {count ? `per gathering · ${gatherings}` : data.events.length ? 'once attendance is marked' : ''}
      </Text>
    </View>
  </View>;
}

function Bar({ event, width, scaleMax, t }: { event: YearEvent; width: number; scaleMax: number; t: AppTheme }) {
  const corner = { borderTopLeftRadius: width / 2, borderTopRightRadius: width / 2 };
  if (event.required === 0) return <View style={[styles.stub, { width, backgroundColor: t.muted }]} />;
  // Incomplete gatherings are greyed so a partial count never reads as final.
  const color = event.rate === null ? t.muted : t.primary;
  const opacity = event.rate === null ? 0.4 : 1;
  if (event.present === 0) return <View style={[styles.stub, { width, backgroundColor: color, opacity }]} />;
  return <View style={[corner, { width, height: Math.max(3, Math.round((event.present / scaleMax) * PLOT_HEIGHT)), backgroundColor: color, opacity }]} />;
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
  axis: { position: 'absolute', left: 0, bottom: 0, height: 1 },
  months: { height: 18 },
  month: { position: 'absolute', top: 0, flexDirection: 'row' },
  tick: { width: 1, height: 5 },
  monthLabel: { marginLeft: 3, marginTop: 2, fontFamily: fonts.bodyMedium, fontSize: 10, lineHeight: 14 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 6, height: 12, opacity: 0.4, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  legendText: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14 },
});

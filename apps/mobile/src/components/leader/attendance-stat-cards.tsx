import { StyleSheet, Text, View } from 'react-native';
import { fonts, radius, surfaceShadow, useAppTheme } from '@/constants/tokens';
import { percent } from './attendance-heatmap';
import { shortDate, type AttendanceYearData } from './attendance-bar-chart';

type Summary = AttendanceYearData['summary'];

// Three at-a-glance numbers for the leader: how the latest gathering went,
// whether recent gatherings are above or below the year's average, and how
// many started events still need attendance marked.
export function AttendanceStatCards({ summary }: { summary: Summary }) {
  const t = useAppTheme();
  const last = summary.lastGathering;
  const delta = summary.rate !== null && summary.recentRate !== null && summary.recentEvents < summary.completedEvents
    ? Math.round((summary.recentRate - summary.rate) * 100)
    : null;
  const recentLabel = summary.recentEvents > 1 ? `Last ${summary.recentEvents} gatherings` : 'Latest gathering';
  return <View style={styles.row}>
    <StatCard
      label="Latest"
      value={last ? `${last.present}/${last.required}` : '—'}
      caption={last ? `present · ${shortDate(last.startAt)}` : 'None marked yet'}
      accessibilityLabel={last ? `Latest gathering, ${last.title} on ${shortDate(last.startAt)}: ${last.present} of ${last.required} present` : 'Latest gathering: none fully marked yet'}
    />
    <StatCard
      label={summary.recentEvents > 1 ? `Last ${summary.recentEvents}` : 'Recent'}
      value={summary.recentRate === null ? '—' : percent(summary.recentRate)}
      caption={delta === null ? 'attendance' : delta === 0 ? 'same as avg' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} pts vs avg`}
      captionColor={delta === null || delta === 0 ? undefined : delta > 0 ? t.success : t.warmInk}
      accessibilityLabel={summary.recentRate === null
        ? 'Recent attendance: not available yet'
        : `${recentLabel}: ${percent(summary.recentRate)} attendance${delta === null ? '' : delta === 0 ? ', same as the year average' : `, ${Math.abs(delta)} points ${delta > 0 ? 'above' : 'below'} the year average`}`}
    />
    <StatCard
      label="To mark"
      value={String(summary.toMark)}
      valueColor={summary.toMark > 0 ? t.warmInk : undefined}
      caption={summary.toMark === 0 ? 'All caught up' : summary.toMark === 1 ? 'gathering' : 'gatherings'}
      accessibilityLabel={summary.toMark === 0 ? 'All gatherings this year are marked' : `${summary.toMark} ${summary.toMark === 1 ? 'gathering needs' : 'gatherings need'} attendance marked`}
    />
  </View>;
}

function StatCard({ label, value, caption, valueColor, captionColor, accessibilityLabel }: {
  label: string; value: string; caption: string; valueColor?: string; captionColor?: string; accessibilityLabel: string;
}) {
  const t = useAppTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, ...surfaceShadow(t) }]} accessible accessibilityLabel={accessibilityLabel}>
    <Text style={[styles.label, { color: t.muted }]} numberOfLines={1}>{label}</Text>
    <Text style={[styles.value, { color: valueColor ?? t.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
    <Text style={[styles.caption, { color: captionColor ?? t.muted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{caption}</Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 12, borderRadius: radius.lg, gap: 2 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  value: { fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  caption: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14 },
});

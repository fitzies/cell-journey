import { SymbolView } from 'expo-symbols';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { formatDateParts, formatDay, formatTimeRange } from '@/lib/date';

export function MemberScreen({ title, children }: PropsWithChildren<{ title: string }>) {
  const t = useAppTheme();
  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: t.background }]}>
      <AppHeader title={title} mode="member" />
      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function MemberSection({ title, action, children }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  const t = useAppTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text accessibilityRole="header" style={[textStyles.section, { color: t.text }]}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function MemberDateTile({ startAt }: { startAt: number }) {
  const t = useAppTheme();
  const date = formatDateParts(startAt);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.date, { backgroundColor: t.soft }]}>
      <Text style={[styles.month, { color: t.muted }]}>{date.month}</Text>
      <Text style={[styles.day, { color: t.text }]}>{date.day}</Text>
    </View>
  );
}

type MemberEvent = {
  title: string;
  startAt: number;
  endAt: number;
  venue?: string;
  location?: string;
  word?: string;
  worship?: string;
  remarks?: string;
};

// Match the leader feed's date tile and compact card, keeping member details inline.
export function MemberEventCard({ event, details = false, onPress }: { event: MemberEvent; details?: boolean; onPress?: () => void }) {
  const t = useAppTheme();
  const content = (
    <>
      <View style={styles.eventRow}>
        <MemberDateTile startAt={event.startAt} />
        <View style={styles.copy}>
          <Text style={[styles.rowTitle, { color: t.text }]}>{event.title}</Text>
          <Text style={[styles.meta, { color: t.muted }]}>{formatDay(event.startAt)} · {formatTimeRange(event.startAt, event.endAt).replace(/ (am|pm)/gi, '\u00a0$1')}</Text>
          <Text style={[styles.meta, { color: t.muted }]}>{event.venue || event.location || 'Venue TBC'}</Text>
        </View>
        {onPress ? <MemberChevron /> : null}
      </View>
      {details && (event.word || event.worship || event.remarks) ? (
        <View style={[styles.eventDetails, { borderTopColor: t.track }]}>
          {event.word ? <EventDetail label="Word" value={event.word} /> : null}
          {event.worship ? <EventDetail label="Worship" value={event.worship} /> : null}
          {event.remarks ? <Text style={[textStyles.body, { color: t.muted }]}>{event.remarks}</Text> : null}
        </View>
      ) : null}
    </>
  );
  const cardStyle = [styles.card, { backgroundColor: t.surface, ...surfaceShadow(t) }];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [cardStyle, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}>{content}</Pressable>
  ) : <View style={cardStyle}>{content}</View>;
}

function EventDetail({ label, value }: { label: string; value: string }) {
  const t = useAppTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[textStyles.body, styles.detailLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[textStyles.body, styles.copy, { color: t.text }]}>{value}</Text>
    </View>
  );
}

export function MemberChevron() {
  const t = useAppTheme();
  return <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={15} tintColor={t.strong} weight="semibold" />;
}

export function MemberEmptyState({ title, body }: { title: string; body: string }) {
  const t = useAppTheme();
  return (
    <View style={[styles.empty, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
      <Text style={[textStyles.section, { color: t.text }]}>{title}</Text>
      <Text style={[styles.meta, { color: t.muted }]}>{body}</Text>
    </View>
  );
}

export function MemberHistoryRow({ event, status, location = false }: {
  event: { title: string; startAt: number; venue?: string; location?: string };
  status: string;
  location?: boolean;
}) {
  const t = useAppTheme();
  const present = status === 'present';
  return (
    <View style={[styles.historyRow, { borderBottomColor: t.track }]}>
      <MemberDateTile startAt={event.startAt} />
      <View style={styles.copy}>
        <Text style={[styles.rowTitle, { color: t.text }]}>{event.title}</Text>
        <Text style={[styles.meta, { color: t.muted }]}>{formatDay(event.startAt)}{location ? ` · ${new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit' }).format(event.startAt)}` : ''}</Text>
        {location ? <Text style={[styles.meta, { color: t.muted }]}>{event.venue || event.location || 'Venue TBC'}</Text> : null}
        <View style={styles.status}>
          <SymbolView name={present ? { ios: 'checkmark', android: 'check', web: 'check' } : { ios: 'minus', android: 'remove', web: 'remove' }} size={12} tintColor={present ? t.success : t.muted} weight="semibold" />
          <Text style={[styles.statusText, { color: present ? t.success : t.muted }]}>{present ? 'Present' : 'Absent'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 108 },
  section: { marginTop: 30 },
  sectionHeading: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  card: { padding: 15, borderRadius: radius.lg, borderCurve: 'continuous' },
  eventRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 13 },
  date: { width: 54, height: 60, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  month: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.75 },
  day: { marginTop: 2, fontFamily: fonts.bodySemiBold, fontSize: 24, lineHeight: 26, letterSpacing: -0.7 },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { ...textStyles.body, fontFamily: fonts.bodySemiBold, letterSpacing: -0.3 },
  meta: { ...textStyles.body, marginTop: 5 },
  eventDetails: { borderTopWidth: 1, marginTop: 15, paddingTop: 13, gap: 8 },
  detailRow: { flexDirection: 'row', gap: 12 },
  detailLabel: { width: 62 },
  empty: { padding: 18, borderRadius: radius.lg, gap: 3 },
  historyRow: { paddingVertical: 15, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 13 },
  status: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.3 },
});

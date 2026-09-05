import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { formatDateParts } from '@/lib/date';
import type { Doc } from '@/lib/api';

export type AttendanceEventKind = 'open' | 'upcoming' | 'complete' | 'needs';

function attendanceStatusColor(kind: AttendanceEventKind, dark: boolean) {
  if (kind === 'open') return dark ? '#D6BB84' : '#795818';
  if (kind === 'upcoming') return dark ? '#A4C0D9' : '#3F617F';
  if (kind === 'complete') return dark ? '#A1CBAA' : '#3E6948';
  return dark ? '#DEAAA7' : '#914A46';
}

export function AttendanceEventCard({
  event,
  kind,
  status,
  zoom = true,
}: {
  event: Doc<'events'>;
  kind: AttendanceEventKind;
  status: string;
  zoom?: boolean;
}) {
  const content = <AttendanceEventCardContent event={event} kind={kind} status={status} />;
  const href = {
    pathname: '/(leader-tabs)/attendance/[eventId]',
    params: { eventId: event._id },
  } as const;

  return (
    <Link href={href} asChild>
      {zoom ? <Link.AppleZoom>{content}</Link.AppleZoom> : content}
    </Link>
  );
}

export function AttendanceEventCardContent({
  event,
  kind,
  status,
  onPress,
  tail = 'right',
}: {
  event: Doc<'events'>;
  kind: AttendanceEventKind;
  status: string;
  onPress?: () => void;
  tail?: 'right' | 'down';
}) {
  const t = useAppTheme();
  const date = formatDateParts(event.startAt);
  const dark = useColorScheme() === 'dark';
  const time = new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit' }).format(event.startAt);
  const place = event.venue || event.location || 'Venue TBC';
  return (
    <Pressable
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${status}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        surfaceShadow(t),
        {
          backgroundColor: t.surface,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={[styles.date, { backgroundColor: t.soft }]}>
        <Text style={[styles.month, { color: t.muted }]}>{date.month}</Text>
        <Text style={[styles.day, { color: t.ink }]}>{date.day}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: t.ink }]} numberOfLines={1}>{event.title}</Text>
        <Text style={[styles.meta, { color: t.muted }]} numberOfLines={1}>{time} · {place}</Text>
        <Text style={[styles.status, { color: attendanceStatusColor(kind, dark) }]} numberOfLines={1}>{status}</Text>
      </View>
      <SymbolView
        name={tail === 'down'
          ? { ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }
          : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={15}
        tintColor={t.strong}
        weight="semibold"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 96, paddingVertical: 13, paddingLeft: 15, paddingRight: 13, borderRadius: radius.lg, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', gap: 13 },
  date: { width: 54, height: 60, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  month: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.75 },
  day: { marginTop: 2, fontFamily: fonts.bodySemiBold, fontSize: 24, lineHeight: 26, letterSpacing: -0.7 },
  copy: { flex: 1, minWidth: 0 },
  title: { ...textStyles.body, fontFamily: fonts.bodySemiBold, letterSpacing: -0.3 },
  meta: { ...textStyles.body, marginTop: 5 },
  status: { marginTop: 5, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.3 },
});

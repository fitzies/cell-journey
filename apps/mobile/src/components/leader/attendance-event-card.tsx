import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Link, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Platform, type PressableProps, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { formatDateParts } from '@/lib/date';
import { api, type Doc } from '@/lib/api';
import { useGroups } from '@/components/group-context';

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
  const { ledGroups } = useGroups();
  const group = ledGroups.find((candidate) => candidate._id === event.groupId);
  const canEdit = !!group?.capabilities.updateEvents && !event.cancelledAt;
  const canDelete = !!group?.capabilities.cancelEvents && !event.cancelledAt;
  const cancelEvent = useMutation(api.events.cancel);
  const deletingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const edit = () => {
    if (!canEdit || deletingRef.current) return;
    router.push({ pathname: '/create-event', params: { groupId: event.groupId, eventId: event._id } });
  };
  const remove = async () => {
    if (!canDelete || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await cancelEvent({ eventId: event._id });
    } catch (error) {
      Alert.alert('Could not delete event', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };
  const confirmDelete = () => {
    if (!canDelete || deletingRef.current) return;
    Alert.alert('Delete event?', `"${event.title}" will be removed from the schedule. Existing attendance records will be kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete event', style: 'destructive', onPress: () => { void remove(); } },
    ]);
  };
  const showMenu = () => {
    if (deletingRef.current) return;
    void Haptics.selectionAsync().catch(() => {});
    Alert.alert(event.title, undefined, [
      ...(canEdit ? [{ text: 'Edit', onPress: edit }] : []),
      ...(canDelete ? [{ text: 'Delete', style: 'destructive' as const, onPress: confirmDelete }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const hasActions = canEdit || canDelete;
  const content = <AttendanceEventCardContent
    event={event} kind={kind} status={deleting ? 'Deleting…' : status}
    disabled={deleting}
    accessibilityHint={hasActions ? 'Touch and hold for event actions.' : undefined}
    accessibilityActions={hasActions ? [
      ...(canEdit ? [{ name: 'edit', label: 'Edit event' }] : []),
      ...(canDelete ? [{ name: 'delete', label: 'Delete event' }] : []),
    ] : undefined}
    onAccessibilityAction={({ nativeEvent }) => {
      if (nativeEvent.actionName === 'edit') edit();
      if (nativeEvent.actionName === 'delete') confirmDelete();
    }}
    onLongPress={hasActions && Platform.OS !== 'ios' ? showMenu : undefined}
  />;
  const href = {
    pathname: '/(leader-tabs)/attendance/[eventId]',
    params: { eventId: event._id },
  } as const;

  return (
    <Link href={href} asChild>
      <Link.Trigger>{zoom ? <Link.AppleZoom>{content}</Link.AppleZoom> : content}</Link.Trigger>
      {hasActions && Platform.OS === 'ios' ? <Link.Menu>
        {canEdit ? <Link.MenuAction icon="pencil" disabled={deleting} onPress={edit}>Edit</Link.MenuAction> : null}
        {canDelete ? <Link.MenuAction icon="trash" destructive disabled={deleting} onPress={confirmDelete}>Delete</Link.MenuAction> : null}
      </Link.Menu> : null}
    </Link>
  );
}

export function AttendanceEventCardContent({
  event,
  kind,
  status,
  onPress,
  tail = 'right',
  ...pressableProps
}: {
  event: Doc<'events'>;
  kind: AttendanceEventKind;
  status: string;
  onPress?: () => void;
  tail?: 'right' | 'down';
} & Omit<PressableProps, 'children' | 'style'>) {
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
      {...pressableProps}
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

import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Alert, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { leaderAccessLabel, useGroups } from '@/components/group-context';
import { EmptyState, LeaderScreen } from '@/components/leader/ui';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { formatDateParts, formatTimeRange } from '@/lib/date';
import { api, type Doc } from '@/lib/api';
import { getProfileGreetingName } from '@/lib/name';

function eventPlace(event: Doc<'events'>) {
  return event.venue || event.location || 'Venue TBC';
}

function requestSummary(rows: { profile: Doc<'userProfiles'> | null }[]) {
  const names = rows.map(({ profile }) => getProfileGreetingName(profile, 'Someone'));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and one other person`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

export default function LeaderHomeScreen() {
  const t = useAppTheme();
  const [now, setNow] = useState(Date.now);
  const groups = useGroups();
  const { context, selectedLeaderGroup: group } = groups;
  const canManageJoinRequests = group?.capabilities.manageJoinRequests === true;
  const canManageMembers = group?.capabilities.manageMembers === true;
  const canMarkAttendance = group?.capabilities.markAttendance === true;
  const canCreateEvents = group?.capabilities.createEvents === true;
  const events = useQuery(api.events.listForGroup, group ? { groupId: group._id, from: now, limit: 5 } : 'skip');
  const pending = useQuery(api.groups.listPendingJoinRequestsForGroup, group && canManageJoinRequests ? { groupId: group._id } : 'skip');
  const members = useQuery(api.groups.listMembers, group && canManageMembers ? { groupId: group._id } : 'skip');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);

  if (
    context === undefined ||
    (group && events === undefined) ||
    (canManageJoinRequests && pending === undefined) ||
    (canManageMembers && members === undefined)
  ) return <LoadingState />;

  if (!group) {
    return (
      <LeaderScreen title="Home" contentStyle={styles.pageContent}>
        <EmptyState title="No group assigned." body="Ask the app owner to assign this account to a group before using leader tools." />
      </LeaderScreen>
    );
  }

  const pendingRows = pending ?? [];
  const activeMemberCount = (members ?? []).filter(({ membership }) => membership.status === 'active').length;
  const next = events?.[0];
  const later = (events ?? []).slice(1, 3);
  const groupMeta = canManageMembers
    ? `${activeMemberCount} ${activeMemberCount === 1 ? 'member' : 'members'}${canManageJoinRequests ? ` · ${pendingRows.length} ${pendingRows.length === 1 ? 'request' : 'requests'}` : ''}`
    : leaderAccessLabel(group.accessRole);

  const chooseGroup = () => {
    if (groups.ledGroups.length < 2) return;
    const labels = groups.ledGroups.map((row) => row.name);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, 'Cancel'], cancelButtonIndex: labels.length, title: 'Choose a group' },
        (index) => {
          const selected = groups.ledGroups[index];
          if (selected) groups.selectLeaderGroup(selected._id);
        },
      );
      return;
    }
    Alert.alert('Choose a group', undefined, [
      ...groups.ledGroups.map((row) => ({ text: row.name, onPress: () => groups.selectLeaderGroup(row._id) })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <LeaderScreen title="Home" contentStyle={styles.pageContent}>

      <Pressable
        accessibilityRole={groups.ledGroups.length > 1 ? 'button' : 'text'}
        accessibilityLabel={groups.ledGroups.length > 1 ? `Switch group. Current group: ${group.name}` : group.name}
        disabled={groups.ledGroups.length < 2}
        onPress={chooseGroup}
        style={({ pressed }) => [styles.groupButton, { opacity: pressed ? 0.55 : 1 }]}
      >
        <Text style={[styles.groupName, { color: t.ink }]} numberOfLines={1}>{group.name}</Text>
        {groups.ledGroups.length > 1 ? (
          <SymbolView name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }} size={14} tintColor={t.muted} weight="semibold" />
        ) : null}
      </Pressable>
      <Text style={[styles.groupMeta, { color: t.muted }]}>{groupMeta}</Text>

      <PrimaryAction
        label={next ? (canMarkAttendance ? 'Take attendance' : 'View attendance') : (canCreateEvents ? 'Create an event' : 'View events')}
        icon={next ? 'checkmark' : canCreateEvents ? 'plus' : 'calendar'}
        onPress={() => router.push(!next && canCreateEvents ? { pathname: '/create-event', params: { groupId: group._id } } : '/(leader-tabs)/attendance')}
      />

      <HomeSection title="Next gathering">
        {next ? (
          <NextEventCard event={next} onPress={() => router.push('/(leader-tabs)/attendance')} />
        ) : (
          <EmptyEventCard onPress={() => router.push('/(leader-tabs)/attendance')} />
        )}
      </HomeSection>

      {canManageJoinRequests && pendingRows.length ? (
        <HomeSection title="Needs your attention">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Review ${pendingRows.length} join ${pendingRows.length === 1 ? 'request' : 'requests'}`}
            onPress={() => router.push('./requests')}
            style={({ pressed }) => [
              styles.attentionRow,
              { backgroundColor: t.surface, ...surfaceShadow(t), opacity: pressed ? 0.68 : 1 },
            ]}
          >
            <View style={[styles.attentionIcon, { backgroundColor: t.soft }]}>
              <SymbolView name={{ ios: 'person.2.fill', android: 'group', web: 'group' }} size={18} tintColor={t.ink} />
            </View>
            <View style={styles.attentionCopy}>
              <Text style={[styles.attentionTitle, { color: t.ink }]}>Join requests</Text>
              <Text style={[styles.attentionDetail, { color: t.muted }]} numberOfLines={1}>{requestSummary(pendingRows)}</Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: t.accent }]}>
              <Text style={[styles.countText, { color: t.accentInk }]}>{pendingRows.length}</Text>
            </View>
            <Chevron />
          </Pressable>
        </HomeSection>
      ) : null}

      {later.length ? (
        <HomeSection
          title="Upcoming"
          action={<Pressable accessibilityRole="button" onPress={() => router.push('/(leader-tabs)/attendance')} hitSlop={8}><Text style={[styles.sectionAction, { color: t.ink }]}>See events</Text></Pressable>}
        >
          <View style={[styles.upcomingList, { borderTopColor: t.track }]}>
            {later.map((event) => <UpcomingRow key={event._id} event={event} onPress={() => router.push('/(leader-tabs)/attendance')} />)}
          </View>
        </HomeSection>
      ) : null}
    </LeaderScreen>
  );
}

function PrimaryAction({ label, icon, onPress }: { label: string; icon: 'checkmark' | 'plus' | 'calendar'; onPress: () => void }) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primaryAction, { backgroundColor: t.accent, ...surfaceShadow(t, 'buttonFilled'), transform: [{ scale: pressed ? 0.985 : 1 }] }]}
    >
      <SymbolView
        name={{ ios: icon, android: icon === 'plus' ? 'add' : icon === 'calendar' ? 'event' : 'check', web: icon === 'plus' ? 'add' : icon === 'calendar' ? 'event' : 'check' }}
        size={20}
        tintColor={t.accentInk}
        weight="semibold"
      />
      <Text style={[styles.primaryLabel, { color: t.accentInk }]}>{label}</Text>
    </Pressable>
  );
}

function HomeSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const t = useAppTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionTitle, { color: t.ink }]}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function NextEventCard({ event, onPress }: { event: Doc<'events'>; onPress: () => void }) {
  const t = useAppTheme();
  const date = formatDateParts(event.startAt);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.nextCard, { backgroundColor: t.surface, ...surfaceShadow(t), transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      <DateTile month={date.month} day={date.day} large />
      <View style={styles.eventCopy}>
        <Text style={[styles.nextTitle, { color: t.ink }]} numberOfLines={1}>{event.title}</Text>
        <Text style={[styles.nextMeta, { color: t.muted }]}>{formatTimeRange(event.startAt, event.endAt)}</Text>
        <Text style={[styles.nextMeta, { color: t.muted }]} numberOfLines={1}>{eventPlace(event)}</Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

function EmptyEventCard({ onPress }: { onPress: () => void }) {
  const t = useAppTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.emptyEvent, { backgroundColor: t.surface, ...surfaceShadow(t), opacity: pressed ? 0.68 : 1 }]}>
      <View style={[styles.emptyIcon, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
        <SymbolView name={{ ios: 'calendar.badge.plus', android: 'event', web: 'event' }} size={22} tintColor={t.ink} />
      </View>
      <View style={styles.eventCopy}>
        <Text style={[styles.emptyTitle, { color: t.ink }]}>Nothing scheduled</Text>
        <Text style={[styles.emptyDetail, { color: t.muted }]}>Create a gathering when your group is ready.</Text>
      </View>
    </Pressable>
  );
}

function UpcomingRow({ event, onPress }: { event: Doc<'events'>; onPress: () => void }) {
  const t = useAppTheme();
  const date = formatDateParts(event.startAt);
  const time = new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit' }).format(event.startAt);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.upcomingRow, { borderBottomColor: t.track, opacity: pressed ? 0.55 : 1 }]}>
      <Text style={[styles.miniDate, { color: t.muted }]}>{date.day}{'\n'}{date.month}</Text>
      <View style={styles.eventCopy}>
        <Text style={[styles.upcomingTitle, { color: t.ink }]} numberOfLines={1}>{event.title}</Text>
        <Text style={[styles.upcomingMeta, { color: t.muted }]} numberOfLines={1}>{time} · {eventPlace(event)}</Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

function DateTile({ month, day, large = false }: { month: string; day: string; large?: boolean }) {
  const t = useAppTheme();
  return (
    <View style={[styles.dateTile, large && styles.largeDateTile, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
      <Text style={[styles.dateMonth, { color: t.muted }]}>{month}</Text>
      <Text style={[styles.dateDay, large && styles.largeDateDay, { color: t.ink }]}>{day}</Text>
    </View>
  );
}

function Chevron() {
  const t = useAppTheme();
  return <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={15} tintColor={t.muted} weight="semibold" />;
}

const styles = StyleSheet.create({
  pageContent: { paddingHorizontal: 20 },
  groupButton: { alignSelf: 'flex-start', minHeight: 44, marginTop: 6, marginLeft: -10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  groupName: { flexShrink: 1, fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.3 },
  groupMeta: { ...textStyles.body, marginTop: -2 },
  primaryAction: { minHeight: 46, marginTop: 20, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  primaryLabel: { fontFamily: fonts.bodySemiBold, fontSize: 17, letterSpacing: -0.3 },
  section: { marginTop: 30 },
  sectionHeading: { minHeight: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  sectionTitle: { ...textStyles.section },
  sectionAction: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  nextCard: { minHeight: 132, paddingHorizontal: 18, paddingVertical: 20, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', gap: 16 },
  dateTile: { width: 54, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  largeDateTile: { width: 68, height: 82, borderRadius: 19 },
  dateMonth: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.8 },
  dateDay: { marginTop: 2, fontFamily: fonts.bodySemiBold, fontSize: 24, lineHeight: 26, letterSpacing: -0.8 },
  largeDateDay: { fontSize: 32, lineHeight: 34, letterSpacing: -1.2 },
  eventCopy: { flex: 1, minWidth: 0 },
  nextTitle: { ...textStyles.section },
  nextMeta: { ...textStyles.body, marginTop: 5 },
  emptyEvent: { minHeight: 108, padding: 18, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', gap: 16 },
  emptyIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...textStyles.section },
  emptyDetail: { ...textStyles.body, maxWidth: 235, marginTop: 5 },
  attentionRow: { minHeight: 68, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: 11 },
  attentionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  attentionCopy: { flex: 1, minWidth: 0 },
  attentionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, letterSpacing: -0.2 },
  attentionDetail: { ...textStyles.body, marginTop: 3 },
  countBadge: { minWidth: 27, height: 27, paddingHorizontal: 8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  upcomingList: { borderTopWidth: 1 },
  upcomingRow: { minHeight: 66, paddingHorizontal: 2, paddingVertical: 8, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniDate: { width: 46, fontFamily: fonts.bodySemiBold, fontSize: 12, lineHeight: 15, textAlign: 'center', textTransform: 'uppercase' },
  upcomingTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, letterSpacing: -0.2 },
  upcomingMeta: { ...textStyles.body, marginTop: 3 },
});

import { useQuery } from 'convex/react';
import { StyleSheet, Text, View } from 'react-native';
import { useGroups } from '@/components/group-context';
import { MemberEmptyState, MemberEventCard, MemberScreen, MemberSection } from '@/components/member/ui';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, textStyles, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';
import { startOfToday } from '@/lib/date';

export default function MemberScheduleScreen() {
  const t = useAppTheme();
  const { context, selectedMemberGroup } = useGroups();
  const group = selectedMemberGroup?.group ?? null;
  const events = useQuery(api.events.listForGroup, group ? { groupId: group._id, from: startOfToday(), limit: 30 } : 'skip');

  if (context === undefined || !group || events === undefined) return <LoadingState />;

  const next = events[0];
  const rest = events.slice(1);

  return (
    <MemberScreen title="Events">
      <Text style={[styles.group, { color: t.muted }]}>{group.name}</Text>
      {next ? (
        <>
          <View style={styles.overview}>
            <Text style={[styles.overviewCount, { color: t.text }]}>{events.length} {events.length === 1 ? 'gathering' : 'gatherings'}</Text>
            <Text style={[styles.sorted, { color: t.muted }]}>Sorted by date</Text>
          </View>
          <Text accessibilityRole="header" style={[styles.nextHeading, { color: t.text }]}>Next gathering</Text>
          <MemberEventCard event={next} details />
          {rest.length ? (
            <MemberSection title="Upcoming" action={<Text style={[styles.sorted, { color: t.muted }]}>{rest.length} {rest.length === 1 ? 'event' : 'events'}</Text>}>
              <View style={styles.list}>
                {rest.map((event) => <MemberEventCard key={event._id} event={event} details />)}
              </View>
            </MemberSection>
          ) : null}
        </>
      ) : (
        <View style={styles.empty}>
          <MemberEmptyState title="No gatherings scheduled" body="When your leader adds the next cell event, it will appear here." />
        </View>
      )}
    </MemberScreen>
  );
}

const styles = StyleSheet.create({
  group: { ...textStyles.body, marginTop: 6 },
  overview: { marginTop: 27, marginBottom: 24, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 },
  overviewCount: { fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.3 },
  sorted: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  nextHeading: { ...textStyles.section, marginBottom: 12 },
  list: { gap: 10 },
  empty: { marginTop: 28 },
});

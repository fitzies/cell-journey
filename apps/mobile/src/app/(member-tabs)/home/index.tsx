import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MemberChevron, MemberEmptyState, MemberEventCard, MemberHistoryRow, MemberScreen, MemberSection } from '@/components/member/ui';
import { useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';
import { useMemberUpcomingEvents } from '@/components/member/use-upcoming-events';

export default function MemberHomeScreen() {
  const t = useAppTheme();
  const { context, selectedMemberGroup } = useGroups();
  const group = selectedMemberGroup?.group ?? null;
  const events = useMemberUpcomingEvents(group?._id);
  const attendance = useQuery(api.attendance.historyForGroup, group ? { groupId: group._id, limit: 3 } : 'skip');

  if (context === undefined || !group || events === undefined || attendance === undefined) return <LoadingState />;

  const next = events[0];
  const rate = attendance.attendanceRate === null ? '—' : `${Math.round(attendance.attendanceRate * 100)}%`;

  return (
    <MemberScreen title="Home">
      <MemberSection first title="Next gathering" action={
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/(member-tabs)/schedule')}>
          <Text style={[styles.sectionAction, { color: t.text }]}>See events</Text>
        </Pressable>
      }>
        {next ? <MemberEventCard event={next} onPress={() => router.push('/(member-tabs)/schedule')} /> : (
          <MemberEmptyState title="Nothing scheduled" body="Your next gathering will appear here once scheduled." />
        )}
      </MemberSection>

      <MemberSection title="Your attendance">
        <Pressable accessibilityRole="button" onPress={() => router.push('/(member-tabs)/attendance')}
          style={({ pressed }) => [styles.attendanceSummary, { backgroundColor: t.surface, ...surfaceShadow(t), opacity: pressed ? 0.68 : 1 }]}>
          <View style={styles.summaryCopy}>
            <Text style={[styles.summaryLabel, { color: t.text }]}>Attendance rate</Text>
            <Text style={[styles.summaryMeta, { color: t.muted }]}>{attendance.presentEvents} of {attendance.totalPastEvents} gatherings attended</Text>
          </View>
          <Text style={[styles.summaryRate, { color: t.text }]}>{rate}</Text>
          <MemberChevron />
        </Pressable>
      </MemberSection>

      <MemberSection title="Recent attendance">
        {attendance.rows.length > 0 ? (
          <View style={[styles.history, { borderTopColor: t.track }]}>
            {attendance.rows.slice(0, 3).map((row) => <MemberHistoryRow key={row.event._id} event={row.event} status={row.status} />)}
          </View>
        ) : <MemberEmptyState title="No attendance yet" body="After your first past event, your recent attendance will show here." />}
      </MemberSection>
    </MemberScreen>
  );
}

const styles = StyleSheet.create({
  sectionAction: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  attendanceSummary: { minHeight: 82, borderRadius: radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryLabel: { ...textStyles.body, fontFamily: fonts.bodySemiBold, letterSpacing: -0.3 },
  summaryMeta: { ...textStyles.body, marginTop: 5 },
  summaryRate: { ...textStyles.title, fontVariant: ['tabular-nums'] },
  history: { borderTopWidth: 1 },
});

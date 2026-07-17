import { useQuery } from 'convex/react';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { GroupSwitcher, useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { Card, LeaderScreen, RowCard, SectionHeader, StatPill, Mark, EmptyState } from '@/components/leader/ui';
import { fonts, useAppTheme } from '@/constants/tokens';
import { formatDay, formatTimeRange, startOfToday } from '@/lib/date';
import { api } from '@/lib/api';

export default function LeaderHomeScreen() {
  const t = useAppTheme();
  const [from] = useState(() => startOfToday());
  const profile = useQuery(api.profiles.current, {});
  const { context, selectedLeaderGroup: group } = useGroups();
  const hasGroup = Boolean(group);
  const events = useQuery(api.events.listForGroup, group ? { groupId: group._id, from, limit: 5 } : 'skip');
  const pending = useQuery(api.groups.listPendingJoinRequestsForGroup, group ? { groupId: group._id } : 'skip');
  const members = useQuery(api.groups.listMembers, group ? { groupId: group._id } : 'skip');

  if (profile === undefined || context === undefined || (hasGroup && (events === undefined || pending === undefined || members === undefined))) return <LoadingState />;
  const pendingRows = pending ?? [];
  const memberRows = members ?? [];
  const next = events?.[0];
  const name = profile?.preferredName?.trim() || profile?.fullName?.trim() || 'Leader';

  if (!hasGroup) {
    return (
      <LeaderScreen eyebrow="Leader home" title={`Hi, ${name.split(/\s+/)[0]}.`} hint="Your leader account is not assigned yet.">
        <EmptyState title="No group assigned." body="Ask the app owner to assign this account to a group in Convex before using leader tools." />
      </LeaderScreen>
    );
  }

  return (
    <LeaderScreen eyebrow="Leader home" title={`Hi, ${name.split(/\s+/)[0]}.`} hint={group?.name ?? 'Your cell group'}>
      <GroupSwitcher mode="leader" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatPill label="Members" value={memberRows.length} />
        <StatPill label="Pending" value={pendingRows.length} />
      </View>

      <SectionHeader title="Next gathering" />
      {next ? (
        <Card accent>
          <Text style={{ color: t.accentInk, opacity: 0.76, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase' }}>{formatDay(next.startAt)} · {formatTimeRange(next.startAt, next.endAt)}</Text>
          <Text style={{ color: t.accentInk, marginTop: 8, fontFamily: fonts.bodyBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.7 }}>{next.title}</Text>
          <Text style={{ color: t.accentInk, marginTop: 8, opacity: 0.82, fontFamily: fonts.body, fontSize: 14 }}>{next.venue || next.location || 'Venue TBC'}</Text>
        </Card>
      ) : (
        <RowCard mark={<Mark>◇</Mark>} title="No upcoming event" detail="Create one from the Schedule tab when you’re ready." />
      )}

      <SectionHeader title="Needs attention" />
      <View style={{ gap: 10 }}>
        <RowCard mark={<Mark>{pendingRows.length}</Mark>} title="Join requests" detail={pendingRows.length ? 'Review pending members in the Members tab.' : 'No pending requests right now.'} />
        <RowCard mark={<Mark>✓</Mark>} title="Attendance" detail="Open the Attendance tab to mark members present or absent." />
      </View>
    </LeaderScreen>
  );
}

import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { GroupSwitcher, leaderAccessLabel, useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { ActionButton, Card, EmptyState, LeaderScreen, Mark, RowCard, SectionHeader, StatPill } from '@/components/leader/ui';
import { fonts, useAppTheme } from '@/constants/tokens';
import { formatDay, formatTimeRange, startOfToday } from '@/lib/date';
import { api, type Doc, type Id } from '@/lib/api';
import { getProfileDisplayName, getProfileGreetingName } from '@/lib/name';

const regionLabels: Record<string, string> = {
  north: 'North', south: 'South', east: 'East', west: 'West', central: 'Central', northeast: 'Northeast', northwest: 'Northwest', southeast: 'Southeast', southwest: 'Southwest',
};

export default function LeaderHomeScreen() {
  const t = useAppTheme();
  const [from] = useState(() => startOfToday());
  const [busyId, setBusyId] = useState<Id<'joinRequests'> | null>(null);
  const { context, selectedLeaderGroup: group } = useGroups();
  const hasGroup = Boolean(group);
  const canManageJoinRequests = group?.capabilities.manageJoinRequests === true;
  const canManageMembers = group?.capabilities.manageMembers === true;
  const events = useQuery(api.events.listForGroup, group ? { groupId: group._id, from, limit: 5 } : 'skip');
  const pending = useQuery(api.groups.listPendingJoinRequestsForGroup, group && canManageJoinRequests ? { groupId: group._id } : 'skip');
  const members = useQuery(api.groups.listMembers, group && canManageMembers ? { groupId: group._id } : 'skip');
  const services = useQuery(api.groups.listServices, canManageJoinRequests ? {} : 'skip');
  const approve = useMutation(api.groups.approveJoinRequest);
  const reject = useMutation(api.groups.rejectJoinRequest);

  const serviceMap = useMemo(() => new Map((services ?? []).map((service) => [service._id, service.name])), [services]);
  const ownerDataLoading = hasGroup && canManageJoinRequests && (pending === undefined || members === undefined || services === undefined);

  if (context === undefined || (hasGroup && events === undefined) || ownerDataLoading) return <LoadingState />;

  const pendingRows = pending ?? [];
  const memberRows = members ?? [];
  const next = events?.[0];
  const greetingName = getProfileGreetingName(context.profile, 'there');

  if (!group) {
    return (
      <LeaderScreen eyebrow="Leader home" title={`Hi, ${greetingName}.`} hint="Your leader account is not assigned yet.">
        <EmptyState title="No group assigned." body="Ask the app owner to assign this account to a group in Convex before using leader tools." />
      </LeaderScreen>
    );
  }

  const roleLabel = leaderAccessLabel(group.accessRole);

  const profileDetail = (profile: Doc<'userProfiles'> | null) => {
    if (!profile) return 'Profile unavailable';
    const region = profile.singaporeRegion ? regionLabels[profile.singaporeRegion] : 'No region selected';
    const serviceNames = profile.serviceIds.map((id) => serviceMap.get(id)).filter(Boolean).join(', ');
    return `${region}${serviceNames ? ` · ${serviceNames}` : ' · No services selected'}`;
  };

  const approveRequest = async (joinRequestId: Id<'joinRequests'>) => {
    if (!canManageJoinRequests) return;
    setBusyId(joinRequestId);
    try {
      await approve({ joinRequestId });
    } catch (err) {
      Alert.alert('Could not approve', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const rejectRequest = (joinRequestId: Id<'joinRequests'>) => {
    if (!canManageJoinRequests) return;
    Alert.alert('Reject request?', 'They can enter another group code and try again.', [
      { text: 'Keep request', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setBusyId(joinRequestId);
          try {
            await reject({ joinRequestId });
          } catch (err) {
            Alert.alert('Could not reject', err instanceof Error ? err.message : 'Please try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <LeaderScreen eyebrow="Leader home" title={`Hi, ${greetingName}.`} hint={`${group.name} · ${roleLabel}`}>
      <GroupSwitcher mode="leader" />

      {canManageJoinRequests ? (
        <View style={styles.statsRow}>
          <StatPill label="Members" value={memberRows.length} />
          <StatPill label="Pending" value={pendingRows.length} />
        </View>
      ) : null}

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

      {canManageJoinRequests ? (
        <>
          <SectionHeader title="Join requests" meta={`${pendingRows.length} pending`} />
          {pendingRows.length ? (
            <View style={styles.cardList}>
              {pendingRows.map(({ request, profile }) => (
                <RowCard
                  key={request._id}
                  mark={<Mark>?</Mark>}
                  title={getProfileDisplayName(profile, 'Unnamed member')}
                  detail={`${profileDetail(profile)}\nRequested ${formatDay(request.requestedAt)}`}
                >
                  <View style={styles.requestActions}>
                    <View style={styles.requestAction}>
                      <ActionButton filled label={busyId === request._id ? 'Approving…' : 'Approve'} disabled={busyId !== null} onPress={() => approveRequest(request._id)} />
                    </View>
                    <View style={styles.requestAction}>
                      <ActionButton danger label="Reject" disabled={busyId !== null} onPress={() => rejectRequest(request._id)} />
                    </View>
                  </View>
                </RowCard>
              ))}
            </View>
          ) : (
            <EmptyState title="No pending requests." body="New requests will appear here as soon as someone enters this group’s code." />
          )}
        </>
      ) : null}

      <SectionHeader title="Attendance" />
      <RowCard mark={<Mark>✓</Mark>} title="Mark this week’s attendance" detail="Open the Attendance tab to mark members present or absent." />
    </LeaderScreen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 10 },
  cardList: { gap: 10 },
  requestActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  requestAction: { flex: 1, minWidth: 0 },
});

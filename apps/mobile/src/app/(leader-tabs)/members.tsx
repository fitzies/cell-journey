import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { GroupSwitcher, useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { ActionButton, EmptyState, LeaderScreen, Mark, RowCard, SectionHeader, StatPill } from '@/components/leader/ui';
import { api, type Doc, type Id } from '@/lib/api';

const regionLabels: Record<string, string> = {
  north: 'North', south: 'South', east: 'East', west: 'West', central: 'Central', northeast: 'Northeast', northwest: 'Northwest', southeast: 'Southeast', southwest: 'Southwest',
};

export default function LeaderMembersScreen() {
  const { context, selectedLeaderGroup: group } = useGroups();
  const hasGroup = Boolean(group);
  const pending = useQuery(api.groups.listPendingJoinRequestsForGroup, group ? { groupId: group._id } : 'skip');
  const members = useQuery(api.groups.listMembers, group ? { groupId: group._id } : 'skip');
  const services = useQuery(api.groups.listServices, {});
  const approve = useMutation(api.groups.approveJoinRequest);
  const reject = useMutation(api.groups.rejectJoinRequest);
  const remove = useMutation(api.groups.removeMemberFromGroupById);
  const [busyId, setBusyId] = useState<string | null>(null);

  const serviceMap = useMemo(() => new Map((services ?? []).map((service) => [service._id, service.name])), [services]);

  if (context === undefined || services === undefined || (hasGroup && (pending === undefined || members === undefined))) return <LoadingState />;

  if (!hasGroup) {
    return (
      <LeaderScreen eyebrow="Members" title="Care for your group." hint="Your leader account is not assigned yet.">
        <EmptyState title="No group assigned." body="Once this leader is assigned to a group, join requests and members will appear here." />
      </LeaderScreen>
    );
  }

  const pendingRows = pending ?? [];
  const memberRows = members ?? [];

  const approveRequest = async (id: Id<'joinRequests'>) => {
    setBusyId(id);
    try { await approve({ joinRequestId: id }); }
    catch (err) { Alert.alert('Could not approve', err instanceof Error ? err.message : 'Please try again.'); }
    finally { setBusyId(null); }
  };

  const rejectRequest = (id: Id<'joinRequests'>) => {
    Alert.alert('Reject request?', 'This member can enter another code and try again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        setBusyId(id);
        try { await reject({ joinRequestId: id }); }
        catch (err) { Alert.alert('Could not reject', err instanceof Error ? err.message : 'Please try again.'); }
        finally { setBusyId(null); }
      } },
    ]);
  };

  const removeMember = (profileRow: Doc<'userProfiles'>) => {
    Alert.alert('Remove member?', `${profileRow.fullName ?? 'This member'} will leave ${group?.name ?? 'this group'}. Other memberships and history stay saved.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setBusyId(profileRow._id);
        try { if (group) await remove({ groupId: group._id, profileId: profileRow._id }); }
        catch (err) { Alert.alert('Could not remove', err instanceof Error ? err.message : 'Please try again.'); }
        finally { setBusyId(null); }
      } },
    ]);
  };

  const profileDetail = (profileRow: Doc<'userProfiles'> | null) => {
    if (!profileRow) return 'Profile unavailable';
    const region = profileRow.singaporeRegion ? regionLabels[profileRow.singaporeRegion] : 'No region';
    const names = profileRow.serviceIds.map((id) => serviceMap.get(id)).filter(Boolean).join(', ');
    return `${region}${names ? ` · ${names}` : ''}`;
  };

  return (
    <LeaderScreen eyebrow="Members" title="Care for your group." hint="Approve requests and keep your active member list tidy.">
      <GroupSwitcher mode="leader" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatPill label="Active" value={memberRows.length} />
        <StatPill label="Pending" value={pendingRows.length} />
      </View>

      <SectionHeader title="Join requests" meta={`${pendingRows.length} pending`} />
      {pendingRows.length ? (
        <View style={{ gap: 10 }}>
          {pendingRows.map(({ request, profile: requestProfile }) => (
            <RowCard key={request._id} mark={<Mark>?</Mark>} title={requestProfile?.fullName ?? 'Unnamed member'} detail={profileDetail(requestProfile)}>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <ActionButton filled label={busyId === request._id ? 'Approving…' : 'Approve'} disabled={busyId !== null} onPress={() => approveRequest(request._id)} />
                <ActionButton danger label="Reject" disabled={busyId !== null} onPress={() => rejectRequest(request._id)} />
              </View>
            </RowCard>
          ))}
        </View>
      ) : (
        <EmptyState title="No pending requests." body="When members enter your group code, their requests will appear here." />
      )}

      <SectionHeader title="Active members" meta={`${memberRows.length} total`} />
      {memberRows.length ? (
        <View style={{ gap: 10 }}>
          {memberRows.map(({ profile: memberProfile }) => memberProfile ? (
            <RowCard key={memberProfile._id} mark={<Mark success>✓</Mark>} title={memberProfile.preferredName || memberProfile.fullName || 'Unnamed member'} detail={profileDetail(memberProfile)} right={<ActionButton danger label="Remove" disabled={busyId !== null} onPress={() => removeMember(memberProfile)} />} />
          ) : null)}
        </View>
      ) : (
        <EmptyState title="No active members." body="Approved members will show up here." />
      )}
    </LeaderScreen>
  );
}

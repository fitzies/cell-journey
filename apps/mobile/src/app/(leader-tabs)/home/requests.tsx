import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useGroups } from '@/components/group-context';
import { ActionButton, EmptyState, LeaderScreen, Mark, RowCard } from '@/components/leader/ui';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, useAppTheme } from '@/constants/tokens';
import { formatDay } from '@/lib/date';
import { api, type Doc, type Id } from '@/lib/api';
import { getProfileDisplayName } from '@/lib/name';
import { getProfileLocationLabel } from '@/lib/profile-location';

export default function LeaderJoinRequestsScreen() {
  const t = useAppTheme();
  const [busyId, setBusyId] = useState<Id<'joinRequests'> | null>(null);
  const { context, selectedLeaderGroup: group } = useGroups();
  const canManage = group?.capabilities.manageJoinRequests === true;
  const pending = useQuery(api.groups.listPendingJoinRequestsForGroup, group && canManage ? { groupId: group._id } : 'skip');
  const services = useQuery(api.groups.listServices, canManage ? {} : 'skip');
  const approve = useMutation(api.groups.approveJoinRequest);
  const reject = useMutation(api.groups.rejectJoinRequest);
  const serviceMap = useMemo(() => new Map((services ?? []).map((service) => [service._id, service.name])), [services]);

  if (context === undefined || (group && canManage && (pending === undefined || services === undefined))) return <LoadingState />;

  const profileDetail = (profile: Doc<'userProfiles'> | null) => {
    if (!profile) return 'Profile unavailable';
    const location = getProfileLocationLabel(profile, 'No postal district');
    const serviceNames = profile.serviceIds.map((id) => serviceMap.get(id)).filter(Boolean).join(', ');
    return `${location}${serviceNames ? ` · ${serviceNames}` : ' · No services selected'}`;
  };

  const approveRequest = async (joinRequestId: Id<'joinRequests'>) => {
    setBusyId(joinRequestId);
    try {
      await approve({ joinRequestId });
    } catch (error) {
      Alert.alert('Could not approve', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const rejectRequest = (joinRequestId: Id<'joinRequests'>) => {
    Alert.alert('Reject request?', 'They can enter another group code and try again.', [
      { text: 'Keep request', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setBusyId(joinRequestId);
          try {
            await reject({ joinRequestId });
          } catch (error) {
            Alert.alert('Could not reject', error instanceof Error ? error.message : 'Please try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <LeaderScreen title="" contentStyle={styles.pageContent}>
      <Text style={[styles.title, { color: t.ink }]}>Join requests</Text>
      <Text style={[styles.subtitle, { color: t.muted }]}>{group?.name ?? 'No group selected'}</Text>
      {!group || !canManage ? (
        <View style={styles.list}><EmptyState title="Requests unavailable." body="Select a group where you can manage join requests." /></View>
      ) : pending?.length ? (
        <View style={styles.list}>
          {pending.map(({ request, profile }) => (
            <RowCard
              key={request._id}
              mark={<Mark>?</Mark>}
              title={getProfileDisplayName(profile, 'Unnamed member')}
              detail={`${profileDetail(profile)}\nRequested ${formatDay(request.requestedAt)}`}
            >
              <View style={styles.actions}>
                <View style={styles.action}><ActionButton filled label={busyId === request._id ? 'Approving…' : 'Approve'} disabled={busyId !== null} onPress={() => void approveRequest(request._id)} /></View>
                <View style={styles.action}><ActionButton danger label="Reject" disabled={busyId !== null} onPress={() => rejectRequest(request._id)} /></View>
              </View>
            </RowCard>
          ))}
        </View>
      ) : (
        <View style={styles.list}><EmptyState title="You’re all caught up." body="New join requests will appear here." /></View>
      )}
    </LeaderScreen>
  );
}

const styles = StyleSheet.create({
  pageContent: { paddingHorizontal: 20 },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 38, lineHeight: 42, letterSpacing: -1.5 },
  subtitle: { marginTop: 5, fontFamily: fonts.bodyMedium, fontSize: 14 },
  list: { marginTop: 26, gap: 10 },
  actions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  action: { flex: 1, minWidth: 0 },
});

import { ProfileAvatar } from '@/components/profile-avatar';
import { useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useGroups } from '@/components/group-context';
import { ActionButton, EmptyState, LeaderScreen, RowCard } from '@/components/leader/ui';
import { type ErrorBoundaryProps } from 'expo-router';
import { LeaderConnectionNotice, LeaderLoadError, LeaderLoadingState } from '@/components/leader/query-state';
import { fonts, useAppTheme } from '@/constants/tokens';
import { formatDay } from '@/lib/date';
import { api, type Doc, type Id } from '@/lib/api';
import { getProfileDisplayName } from '@/lib/name';
import { getProfileLocationLabel } from '@/lib/profile-location';

export default function LeaderJoinRequestsScreen() {
  const t = useAppTheme();
  const [busy, setBusy] = useState<{ id: Id<'joinRequests'>; action: 'approve' | 'reject' } | null>(null);
  const operationPending = useRef(false);
  const { isWebSocketConnected: online } = useConvexConnectionState();
  const connected = useRef(online);
  useLayoutEffect(() => { connected.current = online; }, [online]);
  const [error, setError] = useState<string | null>(null);
  const { width, fontScale } = useWindowDimensions();
  const { context, selectedLeaderGroup: group } = useGroups();
  const canManage = group?.capabilities.manageJoinRequests === true;
  const pending = useQuery(api.groups.listPendingJoinRequestsForGroup, group && canManage ? { groupId: group._id } : 'skip');
  const services = useQuery(api.groups.listServices, canManage ? {} : 'skip');
  const approve = useMutation(api.groups.approveJoinRequest);
  const reject = useMutation(api.groups.rejectJoinRequest);
  const serviceMap = useMemo(() => new Map((services ?? []).map((service) => [service._id, service.name])), [services]);

  if (context === undefined || (group && canManage && (pending === undefined || services === undefined))) return <LeaderLoadingState title="Join requests" label="Loading join requests…" />;

  const profileDetail = (profile: Doc<'userProfiles'> | null) => {
    if (!profile) return 'Profile unavailable';
    const location = getProfileLocationLabel(profile, 'No postal district');
    const serviceNames = profile.serviceIds.map((id) => serviceMap.get(id)).filter(Boolean).join(', ');
    return `${location}${serviceNames ? ` · ${serviceNames}` : ' · No services selected'}`;
  };

  const respondToRequest = async (joinRequestId: Id<'joinRequests'>, action: 'approve' | 'reject') => {
    if (operationPending.current) return;
    if (!connected.current) {
      setError('Reconnect, then try again.');
      return;
    }
    operationPending.current = true;
    setError(null);
    setBusy({ id: joinRequestId, action });
    try {
      await (action === 'approve' ? approve : reject)({ joinRequestId });
      AccessibilityInfo.announceForAccessibility(action === 'approve' ? 'Join request approved.' : 'Join request rejected.');
    } catch {
      setError(`Could not ${action} request. Check your connection and try again. If it has already been handled, it will disappear when the list updates.`);
    } finally {
      operationPending.current = false;
      setBusy(null);
    }
  };

  const rejectRequest = (joinRequestId: Id<'joinRequests'>) => {
    const message = 'They can enter another group code and try again.';
    if (Platform.OS === 'web') {
      if (window.confirm(`Reject request?\n\n${message}`)) void respondToRequest(joinRequestId, 'reject');
      return;
    }
    Alert.alert('Reject request?', message, [
      { text: 'Keep request', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => void respondToRequest(joinRequestId, 'reject') },
    ]);
  };

  return (
    <LeaderScreen title="" contentStyle={styles.pageContent}>
      <Text style={[styles.title, { color: t.ink }]}>Join requests</Text>
      <Text style={[styles.subtitle, { color: t.muted }]}>{group?.name ?? 'No group selected'}</Text>
      <LeaderConnectionNotice />
      {error ? <View accessibilityRole="alert" style={styles.error}>
        <Text style={[styles.detail, { color: t.danger }]}>{error}</Text>
        <ActionButton label="Dismiss" onPress={() => setError(null)} />
      </View> : null}
      {!group || !canManage ? (
        <View style={styles.list}><EmptyState title="Requests unavailable." body="Select a group where you can manage join requests." /></View>
      ) : pending?.length ? (
        <View style={styles.list}>
          {pending.map(({ request, profile }) => (
            <RowCard
              key={request._id}
              mark={<ProfileAvatar photoUrl={profile?.photoUrl} name={getProfileDisplayName(profile, 'Unnamed member')} />}
              title={getProfileDisplayName(profile, 'Unnamed member')}
            >
              <Text style={[styles.detail, { color: t.muted }]}>{profileDetail(profile)}</Text>
              <Text style={[styles.detail, { color: t.muted }]}>Requested {formatDay(request.requestedAt)}</Text>
              <View style={[styles.actions, (width < 380 || fontScale > 1.2) && styles.stackedActions]}>
                <View style={styles.action}><ActionButton filled label={busy?.id === request._id && busy.action === 'approve' ? 'Approving…' : 'Approve'} disabled={busy !== null || !online} onPress={() => void respondToRequest(request._id, 'approve')} /></View>
                <View style={styles.action}><ActionButton danger label={busy?.id === request._id && busy.action === 'reject' ? 'Rejecting…' : 'Reject'} disabled={busy !== null || !online} onPress={() => rejectRequest(request._id)} /></View>
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
  error: { marginTop: 16, gap: 12 },
  detail: { marginTop: 6, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 22 },
  stackedActions: { flexDirection: 'column' },
  action: { flex: 1, minWidth: 0 },
});

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <LeaderLoadError title="Join requests" body="Couldn't load join requests." retry={retry} />;
}

import { useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { useFocusEffect, type ErrorBoundaryProps } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { useGroups } from '@/components/group-context';
import { MemberGrid } from '@/components/leader/members/member-grid';
import { MembersToolbar } from '@/components/leader/members/members-controls';
import type { MemberRow, MemberStatus } from '@/components/leader/members/types';
import { ActionButton, EmptyState, LeaderScreen } from '@/components/leader/ui';
import { LeaderLoadingState } from '@/components/leader/query-state';
import { useAppTheme } from '@/constants/tokens';
import { api, type Id } from '@/lib/api';
import { getProfileDisplayName } from '@/lib/name';

export default function LeaderMembersScreen() {
  const { context, selectedLeaderGroup: group } = useGroups();
  if (context === undefined) return <LeaderLoadingState title="Members" label="Loading members…" />;
  if (!group) return <LeaderScreen title="Members"><EmptyState title="No group assigned." body="Once this leader is assigned to a group, members will appear here." /></LeaderScreen>;
  if (group.accessRole !== 'owner') return <LeaderScreen title="Members"><EmptyState title="Owner-managed roster." body="You can view members while taking attendance. The group owner manages member status and order." /></LeaderScreen>;
  return <GroupMembers key={group._id} groupId={group._id} groupName={group.name} />;
}

function GroupMembers({ groupId, groupName }: { groupId: Id<'groups'>; groupName: string }) {
  const t = useAppTheme();
  const members = useQuery(api.groups.listMembers, { groupId });
  const { isWebSocketConnected: online } = useConvexConnectionState();
  const markInactive = useMutation(api.groups.markMemberInactive);
  const reactivate = useMutation(api.groups.reactivateMember);
  const reorder = useMutation(api.groups.reorderMembers);
  const removeMember = useMutation(api.groups.removeMemberFromGroupById);
  const [status, setStatus] = useState<MemberStatus>('active');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gridRevision, setGridRevision] = useState(0);
  const mounted = useRef(true);
  const focused = useRef(false);
  const operationPending = useRef(false);
  const latestMembers = useRef(members);
  const connected = useRef(online);
  useLayoutEffect(() => { latestMembers.current = members; }, [members]);
  useLayoutEffect(() => { connected.current = online; }, [online]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    // Recreate gesture handlers after native tab reattachment (Gesture Handler 2).
    setGridRevision((value) => value + 1);
    setDragging(false);
    return () => { focused.current = false; };
  }, []));

  const changeStatus = async (row: MemberRow) => {
    if (!mounted.current || !focused.current || operationPending.current) return;
    if (!connected.current) { setError('Reconnect to update this member.'); return; }
    const current = latestMembers.current?.find((member) => member.membership._id === row.membership._id);
    if (!current || current.membership.status !== row.membership.status) return;
    operationPending.current = true;
    setBusy(true);
    setError(null);
    try {
      const action = current.membership.status === 'inactive' ? reactivate : markInactive;
      await action({ groupId, membershipId: current.membership._id });
      AccessibilityInfo.announceForAccessibility(`${getProfileDisplayName(current.profile, 'Member')} is now ${current.membership.status === 'inactive' ? 'active' : 'inactive'}.`);
    } catch (cause) {
      if (mounted.current) setError(`Could not update member. ${cause instanceof Error ? cause.message : 'Please try again.'}`);
    } finally {
      operationPending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const requestStatusChange = (row: MemberRow) => {
    if (operationPending.current || dragging) return;
    if (row.membership.status === 'inactive') { void changeStatus(row); return; }
    const title = `Mark ${getProfileDisplayName(row.profile, 'this member')} inactive?`;
    const message = `They will move to Inactive in ${groupName}. Their attendance history is kept, and you can reactivate them later.`;
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) void changeStatus(row);
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark inactive', onPress: () => { void changeStatus(row); } },
      ]);
    }
  };

  const removeFromGroup = async (row: MemberRow) => {
    if (!mounted.current || !focused.current || operationPending.current) return;
    if (!connected.current) { setError('Reconnect to remove this member.'); return; }
    // Confirmed dialogs can outlive a roster update or a group switch.
    const current = latestMembers.current?.find((member) => member.membership._id === row.membership._id);
    if (!current) return;
    operationPending.current = true;
    setBusy(true);
    setError(null);
    try {
      await removeMember({ groupId, profileId: current.membership.profileId });
      AccessibilityInfo.announceForAccessibility(`${getProfileDisplayName(current.profile, 'Member')} removed from ${groupName}.`);
    } catch (cause) {
      if (mounted.current) setError(`Could not remove member. ${cause instanceof Error ? cause.message : 'Please try again.'}`);
    } finally {
      operationPending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const requestRemoval = (row: MemberRow) => {
    if (operationPending.current || dragging) return;
    const title = `Remove ${getProfileDisplayName(row.profile, 'this member')} from ${groupName}?`;
    const message = 'This ends their membership in this group. Attendance history is kept, and their other groups are unaffected. They will need to rejoin to become a member again.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) void removeFromGroup(row);
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove from group', style: 'destructive', onPress: () => { void removeFromGroup(row); } },
      ]);
    }
  };

  const persistOrder = async (rows: MemberRow[]) => {
    if (!focused.current || !mounted.current || operationPending.current || search.trim()) return;
    if (!connected.current) {
      setGridRevision((value) => value + 1);
      setError('Reconnect to save member order.');
      return;
    }
    const current = latestMembers.current?.filter((row) => row.membership.status === status) ?? [];
    const currentIds = new Set(current.map((row) => row.membership._id));
    if (rows.length !== current.length || new Set(rows.map((row) => row.membership._id)).size !== rows.length || rows.some((row) => !currentIds.has(row.membership._id))) {
      setGridRevision((value) => value + 1);
      setError('The roster changed while you were moving a member. Please try again.');
      return;
    }
    if (rows.every((row, index) => row.membership._id === current[index].membership._id)) return;
    operationPending.current = true;
    setBusy(true);
    setError(null);
    setPendingOrder(rows);
    try {
      await reorder({ groupId, status, membershipIds: rows.map((row) => row.membership._id) });
      AccessibilityInfo.announceForAccessibility('Member order saved.');
    } catch (cause) {
      if (mounted.current) {
        setError(`Could not save member order. ${cause instanceof Error ? cause.message : 'Please try again.'}`);
        setGridRevision((value) => value + 1);
      }
    } finally {
      operationPending.current = false;
      if (mounted.current) { setPendingOrder(null); setBusy(false); }
    }
  };

  if (members === undefined) return <LeaderLoadingState title="Members" label="Loading members…" />;
  const query = search.trim().toLocaleLowerCase();
  const section = pendingOrder ?? members.filter((row) => row.membership.status === status);
  const rows = query ? section.filter((row) => getProfileDisplayName(row.profile, 'Unnamed member').toLocaleLowerCase().includes(query)) : section;

  return <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: t.background }]}>
    <AppHeader title="Members" mode="leader" />
    <MemberGrid
      key={`${status}:${gridRevision}`}
      rows={rows}
      emptyState={<View style={styles.empty}>
        <EmptyState
          title={query ? 'No matching members' : status === 'active' ? 'No active members yet' : 'No inactive members'}
          body={query ? `No ${status} members match “${search.trim()}”. Try another name or clear your search.` : status === 'active' ? 'Approved members appear here. Review join requests from Home, or check Inactive for members you can reactivate.' : 'Members you mark inactive will appear here. You can reactivate them at any time.'}
        />
        <View style={styles.retry}><ActionButton label={query ? 'Clear search' : status === 'active' ? 'View inactive members' : 'View active members'} onPress={() => query ? setSearch('') : setStatus(status === 'active' ? 'inactive' : 'active')} /></View>
      </View>}
      disabled={busy || !online}
      canReorder={!query && rows.length > 1}
      onReorder={persistOrder}
      onChangeStatus={requestStatusChange}
      onRemove={requestRemoval}
      onDraggingChange={setDragging}
      header={<MembersToolbar
        groupName={groupName}
        status={status}
        activeCount={members.filter((row) => row.membership.status === 'active').length}
        inactiveCount={members.filter((row) => row.membership.status === 'inactive').length}
        search={search}
        disabled={busy || dragging}
        busy={busy}
        offline={!online}
        dragging={dragging}
        error={error}
        onDismissError={() => setError(null)}
        onSearch={setSearch}
        onStatus={setStatus}
      />}
    />
  </SafeAreaView>;
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <LeaderScreen title="Members">
    <EmptyState title="Couldn't load members." body="Check your connection and try again." />
    <View style={styles.retry}><ActionButton label="Try again" onPress={() => void retry()} /></View>
  </LeaderScreen>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, empty: { marginTop: 16 }, retry: { marginTop: 16 } });

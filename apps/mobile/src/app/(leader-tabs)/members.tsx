import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { GroupSwitcher, useGroups } from '@/components/group-context';
import { OrderedRosterScreen, type OrderedRosterEntry } from '@/components/leader/ordered-roster';
import { EmptyState, Mark, RowCard, StatPill } from '@/components/leader/ui';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';
import { getProfileDisplayName } from '@/lib/name';

type MemberRow = FunctionReturnType<typeof api.groups.listMembers>[number];

export default function LeaderMembersScreen() {
  const { context, selectedLeaderGroup: group } = useGroups();
  const isOwner = group?.accessRole === 'owner';
  const members = useQuery(api.groups.listMembers, group && isOwner ? { groupId: group._id } : 'skip');
  const reactivate = useMutation(api.groups.reactivateMember);
  const reorder = useMutation(api.groups.reorderMembers);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (context === undefined || (group && isOwner && members === undefined)) return <LoadingState />;

  if (!group) {
    return (
      <OrderedRosterScreen
        eyebrow="Members"
        title="Care for your group."
        hint="Your leader account is not assigned yet."
        headerContent={<EmptyState title="No group assigned." body="Once this leader is assigned to a group, members will appear here." />}
        activeRows={[]}
        inactiveRows={[]}
        showSections={false}
        renderRow={() => null}
      />
    );
  }

  if (!isOwner) {
    return (
      <OrderedRosterScreen
        eyebrow="Members"
        title="Roster overview."
        hint="The primary owner manages roster status and ordering."
        headerContent={(
          <>
            <GroupSwitcher mode="leader" />
            <EmptyState
              title="Owner-managed roster."
              body="You can use the ordered roster while taking attendance. Only the primary owner can reorder members."
            />
          </>
        )}
        activeRows={[]}
        inactiveRows={[]}
        showSections={false}
        renderRow={() => null}
      />
    );
  }

  const memberRows = members ?? [];
  const activeEntries: OrderedRosterEntry<MemberRow>[] = memberRows
    .filter((row) => row.membership.status === 'active')
    .map((row) => ({ id: row.membership._id, value: row }));
  const inactiveEntries: OrderedRosterEntry<MemberRow>[] = memberRows
    .filter((row) => row.membership.status === 'inactive')
    .map((row) => ({ id: row.membership._id, value: row }));

  const persistOrder = async (section: 'active' | 'inactive', rows: OrderedRosterEntry<MemberRow>[]) => {
    await reorder({
      groupId: group._id,
      status: section,
      membershipIds: rows.map((row) => row.value.membership._id),
    });
  };

  const activateMember = async (row: MemberRow) => {
    setBusyId(row.membership._id);
    try {
      await reactivate({ groupId: group._id, membershipId: row.membership._id });
    } catch (error) {
      Alert.alert('Could not activate member', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const headerContent = (
    <>
      <GroupSwitcher mode="leader" />
      <View style={styles.stats}>
        <StatPill label="Active" value={activeEntries.length} />
        <StatPill label="Inactive" value={inactiveEntries.length} />
      </View>
    </>
  );

  return (
    <OrderedRosterScreen
      eyebrow="Members"
      title="Care for your group."
      hint="Drag members into the order you use for attendance."
      headerContent={headerContent}
      activeRows={activeEntries}
      inactiveRows={inactiveEntries}
      activeTitle="Active · required"
      activeDescription="Required for attendance at future events."
      activeEmptyText="No active members."
      inactiveTitle="Inactive · optional"
      inactiveDescription="Not required for attendance, but they can still be marked present."
      inactiveEmptyText="No inactive members."
      canReorder
      reorderControls="inline-handle"
      showReorderHint={false}
      reorderAccessibilityLabel={({ value: row }) => `Reorder ${getProfileDisplayName(row.profile, 'member')}`}
      onReorder={persistOrder}
      onReorderError={(error) => Alert.alert('Could not save member order', error instanceof Error ? error.message : 'Please try again.')}
      renderRow={({ value: row }, reorderHandle) => {
        const inactive = row.membership.status === 'inactive';
        return (
          <RowCard
            compact
            mark={<Mark compact success={!inactive}>{inactive ? '○' : '✓'}</Mark>}
            title={getProfileDisplayName(row.profile, 'Unnamed member')}
            right={(
              <View style={styles.rowActions}>
                {inactive ? (
                  <ActivateButton
                    busy={busyId === row.membership._id}
                    disabled={busyId !== null}
                    onPress={() => void activateMember(row)}
                  />
                ) : null}
                {reorderHandle}
              </View>
            )}
          />
        );
      }}
    />
  );
}

function ActivateButton({ busy, disabled, onPress }: { busy: boolean; disabled: boolean; onPress: () => void }) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.activateButton,
        {
          backgroundColor: t.accent,
          opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <Text style={[styles.activateText, { color: t.accentInk }]}>{busy ? 'Activating…' : 'Activate'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10 },
  rowActions: { flexDirection: 'row', alignItems: 'center' },
  activateButton: { minHeight: 44, borderRadius: radius.pill, justifyContent: 'center', paddingHorizontal: 13 },
  activateText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, letterSpacing: -0.1 },
});

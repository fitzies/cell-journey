import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { GroupSwitcher, useGroups } from '@/components/group-context';
import { OrderedRosterScreen, type OrderedRosterEntry } from '@/components/leader/ordered-roster';
import { EmptyState, Mark, RowCard, StatPill } from '@/components/leader/ui';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api, type Doc, type Id } from '@/lib/api';
import { getProfileDisplayName } from '@/lib/name';

const regionLabels: Record<string, string> = {
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
  central: 'Central',
  northeast: 'Northeast',
  northwest: 'Northwest',
  southeast: 'Southeast',
  southwest: 'Southwest',
};

type MemberRow = FunctionReturnType<typeof api.groups.listMembers>[number];

export default function LeaderMembersScreen() {
  const { context, selectedLeaderGroup: group } = useGroups();
  const isOwner = group?.accessRole === 'owner';
  const members = useQuery(api.groups.listMembers, group && isOwner ? { groupId: group._id } : 'skip');
  const services = useQuery(api.groups.listServices, group && isOwner ? {} : 'skip');
  const markInactive = useMutation(api.groups.markMemberInactive);
  const reactivate = useMutation(api.groups.reactivateMember);
  const remove = useMutation(api.groups.removeMemberFromGroupById);
  const reorder = useMutation(api.groups.reorderMembers);
  const [busyId, setBusyId] = useState<string | null>(null);

  const serviceMap = useMemo(() => new Map((services ?? []).map((service) => [service._id, service.name])), [services]);

  if (context === undefined || (group && isOwner && (members === undefined || services === undefined))) return <LoadingState />;

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
              body="You can use the ordered roster while taking attendance. Only the primary owner can activate, inactivate, remove, or reorder members."
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

  const profileDetail = (profile: Doc<'userProfiles'> | null) => {
    if (!profile) return 'Profile unavailable';
    const region = profile.singaporeRegion ? regionLabels[profile.singaporeRegion] : 'No region';
    const names = profile.serviceIds.map((id) => serviceMap.get(id)).filter(Boolean).join(', ');
    return `${region}${names ? ` · ${names}` : ''}`;
  };

  const runMembershipMutation = async (membershipId: Id<'memberships'>, operation: () => Promise<unknown>, errorTitle: string) => {
    setBusyId(membershipId);
    try {
      await operation();
    } catch (error) {
      Alert.alert(errorTitle, error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const inactivateMember = (row: MemberRow) => {
    const name = getProfileDisplayName(row.profile, 'This member');
    Alert.alert(
      'Make member inactive?',
      `${name} will move to the optional attendance section and will no longer be required for future events.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make inactive',
          onPress: () => void runMembershipMutation(
            row.membership._id,
            () => markInactive({ groupId: group._id, membershipId: row.membership._id }),
            'Could not update member',
          ),
        },
      ],
    );
  };

  const activateMember = (row: MemberRow) => {
    void runMembershipMutation(
      row.membership._id,
      () => reactivate({ groupId: group._id, membershipId: row.membership._id }),
      'Could not activate member',
    );
  };

  const removeMember = (row: MemberRow) => {
    const name = getProfileDisplayName(row.profile, 'This member');
    Alert.alert(
      'Remove member?',
      `${name} will leave ${group.name}. Their attendance history will stay saved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void runMembershipMutation(
            row.membership._id,
            () => remove({ groupId: group._id, profileId: row.membership.profileId }),
            'Could not remove member',
          ),
        },
      ],
    );
  };

  const persistOrder = async (section: 'active' | 'inactive', rows: OrderedRosterEntry<MemberRow>[]) => {
    await reorder({
      groupId: group._id,
      status: section,
      membershipIds: rows.map((row) => row.value.membership._id),
    });
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
      hint="Keep required members first, and retain inactive members as optional without losing their history."
      headerContent={headerContent}
      activeRows={activeEntries}
      inactiveRows={inactiveEntries}
      activeTitle="Active · required"
      activeDescription="Required for attendance at future events."
      activeEmptyText="No active members. Activate someone below when they return."
      inactiveTitle="Inactive · optional"
      inactiveDescription="Not required for attendance, but they can still be marked present."
      inactiveEmptyText="No inactive members."
      canReorder
      onReorder={persistOrder}
      onReorderError={(error) => Alert.alert('Could not save member order', error instanceof Error ? error.message : 'Please try again.')}
      renderRow={({ value: row }) => {
        const profile = row.profile;
        const inactive = row.membership.status === 'inactive';
        const isBusy = busyId === row.membership._id;
        return (
          <RowCard
            mark={<Mark success={!inactive}>{inactive ? '○' : '✓'}</Mark>}
            title={getProfileDisplayName(profile, 'Unnamed member')}
            detail={inactive ? `Inactive · Not required\n${profileDetail(profile)}` : profileDetail(profile)}
          >
            <View style={styles.actions}>
              <MemberAction
                label={isBusy ? 'Updating…' : inactive ? 'Activate' : 'Make inactive'}
                filled={inactive}
                disabled={busyId !== null}
                onPress={() => inactive ? activateMember(row) : inactivateMember(row)}
              />
              <MemberAction
                label="Remove"
                danger
                disabled={busyId !== null}
                onPress={() => removeMember(row)}
              />
            </View>
          </RowCard>
        );
      }}
    />
  );
}

function MemberAction({
  label,
  onPress,
  filled,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  filled?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: filled ? t.accent : t.surface,
          borderColor: filled ? t.accent : t.line,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
      ]}
    >
      <Text style={[styles.actionText, { color: filled ? t.accentInk : danger ? t.danger : t.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionButton: { minHeight: 44, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  actionText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, letterSpacing: -0.1 },
});

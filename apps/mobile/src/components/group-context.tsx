import * as SecureStore from 'expo-secure-store';
import { useConvexAuth, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api, type Id } from '@/lib/api';

const MEMBER_KEY = 'cell-journey:selected-member-group';
const LEADER_KEY = 'cell-journey:selected-leader-group';

type AppContext = FunctionReturnType<typeof api.profiles.currentContext>;
type MemberGroup = AppContext['memberGroups'][number];
type LedGroup = AppContext['ledGroups'][number];

export function leaderAccessLabel(accessRole: LedGroup['accessRole']) {
  return accessRole === 'owner' ? 'Owner' : 'Co-leader';
}

type GroupContextValue = {
  context: AppContext | undefined;
  memberGroups: MemberGroup[];
  ledGroups: LedGroup[];
  selectedMemberGroupId: Id<'groups'> | null;
  selectedLeaderGroupId: Id<'groups'> | null;
  selectedMemberGroup: MemberGroup | null;
  selectedLeaderGroup: LedGroup | null;
  selectMemberGroup: (groupId: Id<'groups'>) => void;
  selectLeaderGroup: (groupId: Id<'groups'>) => void;
};

const GroupContext = createContext<GroupContextValue | null>(null);

async function readSelection(key: string) {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  return await SecureStore.getItemAsync(key);
}

async function writeSelection(key: string, value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export function GroupContextProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.currentOrNull, isAuthenticated ? {} : 'skip');
  const context = useQuery(api.profiles.currentContext, isAuthenticated && profile ? {} : 'skip');
  const [memberId, setMemberId] = useState<Id<'groups'> | null>(null);
  const [leaderId, setLeaderId] = useState<Id<'groups'> | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([readSelection(MEMBER_KEY), readSelection(LEADER_KEY)]).then(([member, leader]) => {
      if (!active) return;
      setMemberId(member as Id<'groups'> | null);
      setLeaderId(leader as Id<'groups'> | null);
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  const memberGroups = useMemo(() => context?.memberGroups ?? [], [context]);
  const ledGroups = useMemo(() => context?.ledGroups ?? [], [context]);
  const selectedMemberGroupId = memberGroups.some((row) => row.group._id === memberId)
    ? memberId
    : memberGroups[0]?.group._id ?? null;
  const selectedLeaderGroupId = ledGroups.some((group) => group._id === leaderId)
    ? leaderId
    : ledGroups[0]?._id ?? null;

  useEffect(() => {
    if (!hydrated || !context) return;
    if (selectedMemberGroupId && selectedMemberGroupId !== memberId) {
      void writeSelection(MEMBER_KEY, selectedMemberGroupId);
    }
    if (selectedLeaderGroupId && selectedLeaderGroupId !== leaderId) {
      void writeSelection(LEADER_KEY, selectedLeaderGroupId);
    }
  }, [context, hydrated, leaderId, memberId, selectedLeaderGroupId, selectedMemberGroupId]);

  const selectMemberGroup = useCallback((groupId: Id<'groups'>) => {
    setMemberId(groupId);
    void writeSelection(MEMBER_KEY, groupId);
  }, []);
  const selectLeaderGroup = useCallback((groupId: Id<'groups'>) => {
    setLeaderId(groupId);
    void writeSelection(LEADER_KEY, groupId);
  }, []);

  const value = useMemo<GroupContextValue>(() => ({
    context,
    memberGroups,
    ledGroups,
    selectedMemberGroupId,
    selectedLeaderGroupId,
    selectedMemberGroup: memberGroups.find((row) => row.group._id === selectedMemberGroupId) ?? null,
    selectedLeaderGroup: ledGroups.find((group) => group._id === selectedLeaderGroupId) ?? null,
    selectMemberGroup,
    selectLeaderGroup,
  }), [context, ledGroups, memberGroups, selectLeaderGroup, selectMemberGroup, selectedLeaderGroupId, selectedMemberGroupId]);

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroups() {
  const value = useContext(GroupContext);
  if (!value) throw new Error('useGroups must be used inside GroupContextProvider');
  return value;
}

export function GroupSwitcher({ mode }: { mode: 'member' | 'leader' }) {
  const t = useAppTheme();
  const groups = useGroups();
  const rows = mode === 'member'
    ? groups.memberGroups.map((row) => ({ group: row.group, role: null }))
    : groups.ledGroups.map((group) => ({ group, role: leaderAccessLabel(group.accessRole) }));
  const selectedId = mode === 'member' ? groups.selectedMemberGroupId : groups.selectedLeaderGroupId;
  const select = mode === 'member' ? groups.selectMemberGroup : groups.selectLeaderGroup;

  if (rows.length <= 1) return null;
  return (
    <View style={styles.switcherWrap}>
      <Text style={[styles.switcherLabel, { color: t.muted }]}>CURRENT GROUP</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherRow}>
        {rows.map(({ group, role }) => {
          const selected = group._id === selectedId;
          return (
            <Pressable
              key={group._id}
              accessibilityRole="button"
              accessibilityLabel={role ? `${group.name}, ${role}` : group.name}
              accessibilityState={{ selected }}
              onPress={() => select(group._id)}
              style={({ pressed }) => [
                styles.groupChip,
                {
                  backgroundColor: selected ? t.accent : t.surface,
                  borderColor: selected ? t.accent : t.line,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <Text style={[styles.groupChipText, { color: selected ? t.accentInk : t.ink }]}>{group.name}</Text>
              {role ? <Text style={[styles.groupChipRole, { color: selected ? t.accentInk : t.muted }]}>{role}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ModeSwitchButton({ current }: { current: 'member' | 'leader' }) {
  const t = useAppTheme();
  const { memberGroups, ledGroups } = useGroups();
  const canSwitch = current === 'member' ? ledGroups.length > 0 : memberGroups.length > 0;
  if (!canSwitch) return null;
  const target = current === 'member' ? 'leader' : 'member';
  return (
    <Pressable
      onPress={() => router.replace(target === 'leader' ? '/(leader-tabs)' : '/(member-tabs)')}
      style={({ pressed }) => [
        styles.modeButton,
        { borderColor: t.line, backgroundColor: t.surface, transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
    >
      <Text style={[styles.modeButtonText, { color: t.ink }]}>Switch to {target} mode</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switcherWrap: { marginBottom: 18 },
  switcherLabel: { marginBottom: 8, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.5 },
  switcherRow: { gap: 8, paddingRight: 12 },
  groupChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  groupChipText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5 },
  groupChipRole: { marginTop: 1, fontFamily: fonts.bodyBold, fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  modeButton: { minHeight: 52, borderWidth: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  modeButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
});

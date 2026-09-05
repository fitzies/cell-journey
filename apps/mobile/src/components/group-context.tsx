import * as SecureStore from 'expo-secure-store';
import { useConvexAuth, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Id } from '@/lib/api';

const MEMBER_KEY = 'cell-journey.selected-member-group';
const LEADER_KEY = 'cell-journey.selected-leader-group';

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

import { useConvexAuth, useQuery } from 'convex/react';
import { Redirect, Tabs } from 'expo-router';
import { useMemo } from 'react';
import type { ColorValue } from 'react-native';
import { useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { SolarTabIcon, type SolarTabIconName } from '@/components/solar-tab-icon';
import { useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

function tabIcon(name: SolarTabIconName) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <SolarTabIcon name={name} color={color} focused={focused} />;
  }

  TabIcon.displayName = `${name}TabIcon`;
  return TabIcon;
}

const homeIcon = tabIcon('home');
const attendanceIcon = tabIcon('attendance');
const scheduleIcon = tabIcon('schedule');
const membersIcon = tabIcon('members');
const profileIcon = tabIcon('profile');
const homeOptions = { title: 'Home', tabBarIcon: homeIcon };
const attendanceOptions = { title: 'Attendance', tabBarIcon: attendanceIcon };
const scheduleOptions = { title: 'Schedule', tabBarIcon: scheduleIcon };
const membersOptions = { title: 'Members', tabBarIcon: membersIcon };
const profileOptions = { title: 'Profile', tabBarIcon: profileIcon };

export default function LeaderTabs() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.currentOrNull, isAuthenticated ? {} : 'skip');
  const { context, selectedLeaderGroup } = useGroups();
  const t = useAppTheme();
  const screenOptions = useMemo(() => ({
    headerShown: false,
    tabBarShowLabel: false,
    tabBarActiveTintColor: t.accent,
    tabBarInactiveTintColor: t.muted,
    tabBarStyle: {
      height: 72,
      paddingTop: 9,
      paddingBottom: 12,
      backgroundColor: t.surface,
      borderTopColor: t.line,
    },
    tabBarItemStyle: { justifyContent: 'center' as const },
  }), [t.accent, t.line, t.muted, t.surface]);
  if (isLoading || (isAuthenticated && profile === undefined)) return <LoadingState />;
  if (!isAuthenticated) return <Redirect href="/(auth)" />;
  if (profile === null) return <Redirect href="/(onboarding)" />;
  if (context === undefined) return <LoadingState />;
  if (context.ledGroups.length === 0) {
    return <Redirect href={context.memberGroups.length > 0 ? '/(member-tabs)' : '/(onboarding)'} />;
  }
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={homeOptions} />
      <Tabs.Screen name="attendance" options={attendanceOptions} />
      <Tabs.Screen name="schedule" options={scheduleOptions} />
      <Tabs.Protected guard={selectedLeaderGroup?.capabilities.manageMembers === true}>
        <Tabs.Screen name="members" options={membersOptions} />
      </Tabs.Protected>
      <Tabs.Screen name="profile" options={profileOptions} />
    </Tabs>
  );
}

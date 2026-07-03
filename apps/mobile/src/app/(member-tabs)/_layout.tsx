import { useConvexAuth } from 'convex/react';
import { Redirect, Tabs } from 'expo-router';
import { useMemo } from 'react';
import { LoadingState } from '@/components/onboarding/ui';
import { SolarTabIcon, type SolarTabIconName } from '@/components/solar-tab-icon';
import { useAppTheme } from '@/constants/tokens';

function tabIcon(name: SolarTabIconName) {
  function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return <SolarTabIcon name={name} color={color} focused={focused} />;
  }

  TabIcon.displayName = `${name}TabIcon`;
  return TabIcon;
}

const homeIcon = tabIcon('home');
const scheduleIcon = tabIcon('schedule');
const attendanceIcon = tabIcon('attendance');
const profileIcon = tabIcon('profile');
const homeOptions = { title: 'Home', tabBarIcon: homeIcon };
const scheduleOptions = { title: 'Schedule', tabBarIcon: scheduleIcon };
const attendanceOptions = { title: 'Attendance', tabBarIcon: attendanceIcon };
const profileOptions = { title: 'Profile', tabBarIcon: profileIcon };

export default function MemberTabs() {
  const { isAuthenticated, isLoading } = useConvexAuth();
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
  if (isLoading) return <LoadingState />;
  if (!isAuthenticated) return <Redirect href="/(auth)" />;
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={homeOptions} />
      <Tabs.Screen name="schedule" options={scheduleOptions} />
      <Tabs.Screen name="attendance" options={attendanceOptions} />
      <Tabs.Screen name="profile" options={profileOptions} />
    </Tabs>
  );
}

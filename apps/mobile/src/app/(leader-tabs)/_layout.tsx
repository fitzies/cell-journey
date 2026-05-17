import { useConvexAuth } from 'convex/react';
import { Redirect, Tabs } from 'expo-router';
import { LoadingState } from '@/components/onboarding/ui';

export default function LeaderTabs() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <LoadingState />;
  if (!isAuthenticated) return <Redirect href="/(auth)" />;
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Tabs.Screen name="members" options={{ title: 'Members' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

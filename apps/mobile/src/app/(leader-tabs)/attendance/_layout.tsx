import { Stack } from 'expo-router';
import { tabHeaderOptions } from '@/components/app-tab-stack';
import { useAppTheme } from '@/constants/tokens';

export const unstable_settings = { initialRouteName: 'index' };

export default function AttendanceStack() {
  const t = useAppTheme();
  return (
    <Stack screenOptions={tabHeaderOptions}>
      <Stack.Screen name="index" />
      {/* Set this before the detail mounts, including its initial loading state. */}
      <Stack.Screen name="[eventId]" options={{
        headerShown: true,
        title: '',
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: t.background },
        headerTintColor: t.ink,
        contentStyle: { backgroundColor: t.background },
      }} />
    </Stack>
  );
}

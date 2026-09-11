import { Stack } from 'expo-router';
import { useAppTheme } from '@/constants/tokens';
import { EventPlaceProvider } from '@/components/events/event-place-context';

export default function CreateEventLayout() {
  const t = useAppTheme();
  return <EventPlaceProvider><Stack screenOptions={{
    title: 'New event',
    headerBackVisible: false,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: t.background },
    headerTintColor: t.ink,
    headerTitleStyle: { fontSize: 19, fontWeight: '600' },
    contentStyle: { backgroundColor: t.background },
  }}>
    <Stack.Screen name="index" />
    <Stack.Screen name="place" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
  </Stack></EventPlaceProvider>;
}

import { Stack } from 'expo-router';

export default function AttendanceStack() {
  return (
    <Stack screenOptions={{ headerShown: false, title: '' }}>
      <Stack.Screen name="index" />
      {/* Set this before the detail mounts, including its initial loading state. */}
      <Stack.Screen name="[eventId]" options={{ headerShown: false, title: '' }} />
    </Stack>
  );
}

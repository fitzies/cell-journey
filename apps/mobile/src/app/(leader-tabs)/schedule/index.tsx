import { Redirect } from 'expo-router';

// Fallback for platforms that retain hidden tab routes.
export default function LegacyScheduleScreen() {
  return <Redirect href="/(leader-tabs)/attendance" />;
}

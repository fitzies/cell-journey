import { Stack } from 'expo-router';
import { useAppTheme } from '@/constants/tokens';

export default function MemberProfileLayout() {
  const t = useAppTheme();
  return <Stack screenOptions={{
    title: '',
    headerBackVisible: false,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: t.background },
    headerTintColor: t.ink,
    headerTitleStyle: { fontSize: 19, fontWeight: '600' },
    contentStyle: { backgroundColor: t.background },
  }} />;
}

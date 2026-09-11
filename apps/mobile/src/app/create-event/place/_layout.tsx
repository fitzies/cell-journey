import { Stack } from 'expo-router';
import { useAppTheme } from '@/constants/tokens';

export default function PlaceLayout() {
  const t = useAppTheme();
  return <Stack screenOptions={{
    title: '',
    headerBackVisible: false,
    headerShadowVisible: false,
    headerTransparent: true,
    headerStyle: { backgroundColor: 'transparent' },
    headerTintColor: t.ink,
    headerTitleStyle: { fontSize: 19, fontWeight: '600' },
    contentStyle: { backgroundColor: t.background },
  }} />;
}

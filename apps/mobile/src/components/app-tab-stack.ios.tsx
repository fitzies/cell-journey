import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';
import { palettes } from '@/constants/tokens';

const supportsScrollEdgeEffects = Number.parseInt(String(Platform.Version), 10) >= 26;

// Set the header up front so it is already in place on a tab's first frame.
// AppHeader still adds the title and toolbar items from inside each screen.
export const tabHeaderOptions: NativeStackNavigationOptions = {
  headerShown: true,
  title: '',
  headerTransparent: true,
  // iOS 26 supplies the soft edge itself; combining it with blur doubles the effect.
  headerBlurEffect: supportsScrollEdgeEffects ? undefined : 'systemMaterial',
  headerShadowVisible: false,
  headerStyle: { backgroundColor: 'transparent' },
  headerTintColor: palettes.light.ink,
  scrollEdgeEffects: { top: 'soft' },
  contentStyle: { backgroundColor: palettes.light.background },
};

export function AppTabStack() {
  return <Stack screenOptions={tabHeaderOptions} />;
}

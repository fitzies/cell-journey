import { Stack, type NativeStackNavigationOptions } from 'expo-router';

export const tabHeaderOptions: NativeStackNavigationOptions = { headerShown: false, title: '' };

export function AppTabStack() {
  return <Stack screenOptions={tabHeaderOptions} />;
}

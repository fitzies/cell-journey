import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { Appearance, Platform, StatusBar, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
import { NunitoSans_400Regular } from '@expo-google-fonts/nunito-sans/400Regular';
import { NunitoSans_400Regular_Italic } from '@expo-google-fonts/nunito-sans/400Regular_Italic';
import { NunitoSans_500Medium } from '@expo-google-fonts/nunito-sans/500Medium';
import { NunitoSans_600SemiBold } from '@expo-google-fonts/nunito-sans/600SemiBold';
import { NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans/700Bold';
import { GroupContextProvider } from '@/components/group-context';
import { LeaderNavigationProvider } from '@/components/leader-navigation-context';
import { AccountActionsProvider } from '@/components/account-actions';
import { palettes } from '@/constants/tokens';
import { convex } from '@/lib/convex';

const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

const lightNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: palettes.light.accent,
    background: palettes.light.background,
    card: palettes.light.surface,
    text: palettes.light.ink,
    border: palettes.light.line,
    notification: palettes.light.danger,
  },
};

// Light mode only. app.json sets this for native builds; this also covers
// native views (menus, pickers, blur) in builds made before that change.
if (Platform.OS !== 'web') Appearance.setColorScheme('light');

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_400Regular_Italic,
    NunitoSans_500Medium,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
  });
  if (!fontsLoaded) return <View style={{ flex: 1 }} />;
  if (!convex) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text>Set EXPO_PUBLIC_CONVEX_URL to start Cell Journey.</Text></View>;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexAuthProvider
        client={convex}
        storage={Platform.OS === 'ios' || Platform.OS === 'android' ? secureStorage : undefined}
      >
        <AccountActionsProvider>
        <GroupContextProvider>
          <LeaderNavigationProvider>
          <ThemeProvider value={lightNavigationTheme}>
            {/* React Native also updates the separate windows used by Android dialogs. */}
            {Platform.OS === 'android' ? <StatusBar barStyle="dark-content" /> : null}
            <Stack screenOptions={{
              headerShown: false,
              // Native Android screens inherit this, including full-screen event modals.
              statusBarStyle: Platform.OS === 'android' ? 'dark' : undefined,
            }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="create-event" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
              <Stack.Screen name="member-profile" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            </Stack>
          </ThemeProvider>
          </LeaderNavigationProvider>
        </GroupContextProvider>
        </AccountActionsProvider>
      </ConvexAuthProvider>
    </GestureHandlerRootView>
  );
}

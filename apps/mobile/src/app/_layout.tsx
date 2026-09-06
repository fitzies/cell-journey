import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { Platform, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
import { InterTight_400Regular } from '@expo-google-fonts/inter-tight/400Regular';
import { InterTight_400Regular_Italic } from '@expo-google-fonts/inter-tight/400Regular_Italic';
import { InterTight_500Medium } from '@expo-google-fonts/inter-tight/500Medium';
import { InterTight_600SemiBold } from '@expo-google-fonts/inter-tight/600SemiBold';
import { InterTight_700Bold } from '@expo-google-fonts/inter-tight/700Bold';
import { GroupContextProvider } from '@/components/group-context';
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

const darkNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: palettes.dark.accent,
    background: palettes.dark.background,
    card: palettes.dark.surface,
    text: palettes.dark.ink,
    border: palettes.dark.line,
    notification: palettes.dark.danger,
  },
};

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({ InterTight_400Regular, InterTight_400Regular_Italic, InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold });
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
          <ThemeProvider value={scheme === 'dark' ? darkNavigationTheme : lightNavigationTheme}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="create-event" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
            </Stack>
          </ThemeProvider>
        </GroupContextProvider>
        </AccountActionsProvider>
      </ConvexAuthProvider>
    </GestureHandlerRootView>
  );
}

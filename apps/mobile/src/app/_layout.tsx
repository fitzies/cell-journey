import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { Stack } from 'expo-router';
import { Platform, Text, useColorScheme, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useFonts, Fraunces_400Regular, Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { GroupContextProvider } from '@/components/group-context';
import { convex } from '@/lib/convex';

const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({ Fraunces_400Regular, Fraunces_400Regular_Italic, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });
  if (!fontsLoaded) return <View style={{ flex: 1 }} />;
  if (!convex) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text>Set EXPO_PUBLIC_CONVEX_URL to start Cell Journey.</Text></View>;
  return (
    <ConvexAuthProvider
      client={convex}
      storage={Platform.OS === 'ios' || Platform.OS === 'android' ? secureStorage : undefined}
    >
      <GroupContextProvider>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
      </GroupContextProvider>
    </ConvexAuthProvider>
  );
}

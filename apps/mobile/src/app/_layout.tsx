import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { ConvexProvider } from 'convex/react';
import { Stack } from 'expo-router';
import { useColorScheme, View, Text } from 'react-native';
import { useFonts, Fraunces_400Regular, Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { convex } from '@/lib/convex';

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({ Fraunces_400Regular, Fraunces_400Regular_Italic, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });
  const tree = <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}><Stack screenOptions={{ headerShown: false }} /></ThemeProvider>;
  if (!fontsLoaded) return <View style={{ flex: 1 }} />;
  if (!convex) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text>Set EXPO_PUBLIC_CONVEX_URL to start Cell Journey.</Text></View>;
  return <ConvexProvider client={convex}>{tree}</ConvexProvider>;
}

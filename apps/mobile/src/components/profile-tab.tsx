import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

export default function ProfileTab() {
  const t = useAppTheme();
  const { signOut } = useAuthActions();
  const profile = useQuery(api.profiles.currentOrNull, {});
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      router.replace('/(auth)');
    } finally {
      setBusy(false);
    }
  };

  if (profile === undefined) return <LoadingState />;
  const displayName = profile?.preferredName?.trim() || profile?.fullName?.trim() || 'Signed in';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'space-between' }}>
        <View style={{ gap: 12 }}>
          <Text style={{ color: t.accent, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 2.6 }}>PROFILE</Text>
          <Text style={{ color: t.ink, fontFamily: fonts.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 }}>{displayName}</Text>
          {profile?.role ? (
            <Text style={{ color: t.muted, fontFamily: fonts.body, fontSize: 14 }}>
              Signed in as {profile.role}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={handleSignOut}
          disabled={busy}
          style={({ pressed }) => ({
            borderRadius: radius.pill,
            minHeight: 54,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 22,
            borderWidth: 1,
            borderColor: t.line,
            backgroundColor: 'transparent',
            opacity: busy ? 0.5 : 1,
            transform: [{ scale: pressed && !busy ? 0.985 : 1 }],
          })}
        >
          <Text style={{ color: t.ink, fontFamily: fonts.bodySemiBold, fontSize: 17 }}>
            {busy ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

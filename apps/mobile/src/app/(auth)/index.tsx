import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { makeRedirectUri } from 'expo-auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { BodyText, OnboardingShell, PrimaryButton } from '@/components/onboarding/ui';
import { useAppTheme } from '@/constants/tokens';

export default function AuthScreen() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const t = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drive navigation off the actual auth state, not the resolution of signIn.
  // signIn resolves before useConvexAuth flips, so an imperative replace here
  // would race the (onboarding) layout guard and bounce us back to /(auth).
  useEffect(() => {
    if (isAuthenticated) router.replace('/(onboarding)');
  }, [isAuthenticated]);

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const redirectTo = makeRedirectUri();
      const { redirect } = await signIn('google', { redirectTo });
      if (Platform.OS === 'web') return;
      const result = await openAuthSessionAsync(redirect!.toString(), redirectTo);
      if (result.type !== 'success') {
        setBusy(false);
        return;
      }
      const code = new URL(result.url).searchParams.get('code');
      if (!code) throw new Error('Missing authorization code in callback URL');
      await signIn('google', { code });
      // Effect above will navigate once isAuthenticated flips to true.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      setBusy(false);
    }
  };

  return (
    <OnboardingShell
      hideProgress
      eyebrow="WELCOME"
      title="Sign in to Cell Journey."
      hint="A quiet way to join your cell group and mark attendance."
      footer={<PrimaryButton label={busy ? 'Opening Google…' : 'Continue with Google'} onPress={handleGoogle} disabled={busy} />}
    >
      <BodyText>Use your Google account to get started.</BodyText>
      {error ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: t.muted, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}
    </OnboardingShell>
  );
}

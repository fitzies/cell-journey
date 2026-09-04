import { useAuthActions } from '@convex-dev/auth/react';
import { makeRedirectUri } from 'expo-auth-session';
import { router } from 'expo-router';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEmailOtp } from '@/components/auth/email-otp-context';
import { OnboardingShell, PrimaryButton } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { emailDeliveryError, emailOtpProvider, isOfflineNow, isValidEmail, normalizeEmail } from '@/lib/email-auth';

export default function AuthScreen() {
  const { signIn } = useAuthActions();
  const { beginVerification, draftEmail, setDraftEmail } = useEmailOtp();
  const t = useAppTheme();
  const [busyMethod, setBusyMethod] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = busyMethod !== null;

  const handleEmail = async () => {
    const email = normalizeEmail(draftEmail);
    const provider = emailOtpProvider(email);
    setDraftEmail(email);
    setError(null);

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (provider === 'dev-otp') {
      beginVerification(email);
      setBusyMethod(null);
      router.push('./verify-email');
      return;
    }
    if (isOfflineNow()) {
      setError("You're offline. Reconnect, then try again.");
      return;
    }

    setBusyMethod('email');
    try {
      await signIn(provider, { email });
      beginVerification(email);
      setBusyMethod(null);
      router.push('./verify-email');
    } catch (err) {
      setError(emailDeliveryError(err));
      setBusyMethod(null);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusyMethod('google');
    try {
      const redirectTo = makeRedirectUri();
      const { redirect } = await signIn('google', { redirectTo });
      if (Platform.OS === 'web') return;
      if (!redirect) throw new Error('Google did not return a sign-in URL');

      const result = await openAuthSessionAsync(redirect.toString(), redirectTo);
      if (result.type !== 'success') {
        setBusyMethod(null);
        return;
      }
      const code = new URL(result.url).searchParams.get('code');
      if (!code) throw new Error('Missing authorization code in callback URL');
      await signIn('google', { code });
    } catch {
      setError('Google sign-in did not finish. Please try again.');
      setBusyMethod(null);
    }
  };

  return (
    <OnboardingShell
      hideProgress
      eyebrow="WELCOME"
      title="Sign in to Cell Journey."
      hint="Join your cell group and keep attendance in one quiet place."
      footer={(
        <View style={styles.footerActions}>
          <PrimaryButton
            arrow={false}
            disabled={busy}
            label={busyMethod === 'email' ? 'Sending code…' : 'Continue with email'}
            onPress={handleEmail}
          />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: t.line }]} />
            <Text style={[styles.orText, { color: t.muted }]}>or</Text>
            <View style={[styles.divider, { backgroundColor: t.line }]} />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={handleGoogle}
            style={({ pressed }) => [
              styles.googleButton,
              { backgroundColor: t.surface, borderColor: t.line },
              { opacity: busy ? 0.45 : 1, transform: [{ scale: pressed && !busy ? 0.985 : 1 }] },
            ]}
          >
            {busyMethod === 'google' ? <ActivityIndicator color={t.ink} size="small" /> : <Text style={[styles.googleMark, { color: t.ink }]}>G</Text>}
            <Text style={[styles.googleLabel, { color: t.ink }]}>Continue with Google</Text>
          </Pressable>
        </View>
      )}
    >
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: t.ink }]}>Email address</Text>
        <TextInput
          accessibilityLabel="Email address"
          accessibilityState={{ disabled: busy }}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!busy}
          keyboardType="email-address"
          onChangeText={(value) => {
            setDraftEmail(value);
            if (error) setError(null);
          }}
          onSubmitEditing={handleEmail}
          placeholder="you@example.com"
          placeholderTextColor={t.muted}
          returnKeyType="go"
          style={[
            styles.emailInput,
            { backgroundColor: t.surface, borderColor: error ? t.danger : t.line, color: t.ink },
          ]}
          textContentType="emailAddress"
          value={draftEmail}
        />
        <Text style={[styles.fieldHint, { color: t.muted }]}>
          {emailOtpProvider(normalizeEmail(draftEmail)) === 'dev-otp'
            ? 'Continue to enter the development sign-in code.'
            : 'A one-time, 8-digit code will arrive by email.'}
        </Text>
      </View>
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: t.danger }]}>{error}</Text> : null}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: 8 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  emailInput: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    fontFamily: fonts.bodyMedium,
    fontSize: 17,
    minHeight: 58,
    paddingHorizontal: 16,
  },
  fieldHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, marginTop: 4 },
  footerActions: { gap: 12 },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 4 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  googleButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 22,
  },
  googleMark: { fontFamily: fonts.bodyBold, fontSize: 17, marginRight: 11 },
  googleLabel: { fontFamily: fonts.bodySemiBold, fontSize: 17, letterSpacing: -0.2 },
});

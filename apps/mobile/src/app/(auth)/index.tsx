import { useAuthActions } from '@convex-dev/auth/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useEmailOtp } from '@/components/auth/email-otp-context';
import { OnboardingShell, PrimaryButton } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { emailDeliveryError, emailOtpProvider, isOfflineNow, isValidEmail, normalizeEmail } from '@/lib/email-auth';

export default function AuthScreen() {
  const { signIn } = useAuthActions();
  const { beginVerification, draftEmail, setDraftEmail } = useEmailOtp();
  const t = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.push('./verify-email');
      return;
    }
    if (isOfflineNow()) {
      setError("You're offline. Reconnect, then try again.");
      return;
    }

    setBusy(true);
    try {
      await signIn(provider, { email });
      beginVerification(email);
      router.push('./verify-email');
    } catch (err) {
      setError(emailDeliveryError(err));
    } finally {
      setBusy(false);
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
            label={busy ? 'Sending code…' : 'Continue with email'}
            onPress={handleEmail}
          />
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
});

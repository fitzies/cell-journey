import { useAuthActions } from '@convex-dev/auth/react';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEmailOtp } from '@/components/auth/email-otp-context';
import { OtpCodeInput, OTP_CODE_LENGTH } from '@/components/auth/otp-code-input';
import { OnboardingShell, PrimaryButton } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { codeVerificationError, emailDeliveryError, emailOtpProvider, isOfflineNow } from '@/lib/email-auth';

const RESEND_DELAY_SECONDS = 60;

function secondsUntilResend(sentAt: number, now: number) {
  return Math.max(0, Math.min(RESEND_DELAY_SECONDS, RESEND_DELAY_SECONDS - Math.floor((now - sentAt) / 1000)));
}

export default function VerifyEmailScreen() {
  const { signIn } = useAuthActions();
  const { markCodeResent, pendingEmail, returnToEmailEntry } = useEmailOtp();
  const t = useAppTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const provider = pendingEmail ? emailOtpProvider(pendingEmail.address) : 'resend-otp';
  const isDevelopmentLogin = provider === 'dev-otp';

  useEffect(() => {
    if (isDevelopmentLogin) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isDevelopmentLogin]);

  const resendIn = useMemo(
    () => pendingEmail ? secondsUntilResend(pendingEmail.sentAt, now) : RESEND_DELAY_SECONDS,
    [now, pendingEmail],
  );

  if (!pendingEmail) return <Redirect href="/(auth)" />;

  const changeEmail = () => {
    returnToEmailEntry();
    router.replace('/(auth)');
  };

  const verify = async () => {
    if (code.length !== OTP_CODE_LENGTH || busy) return;
    setError(null);
    setNotice(null);
    if (isOfflineNow()) {
      setError("You're offline. Reconnect, then try again.");
      return;
    }

    setBusy('verify');
    try {
      const result = await signIn(provider, {
        email: pendingEmail.address,
        code,
      });
      if (!result.signingIn) {
        setError(codeVerificationError(null, isDevelopmentLogin));
        setBusy(null);
      }
    } catch (err) {
      setError(codeVerificationError(err, isDevelopmentLogin));
      setBusy(null);
    }
  };

  const resend = async () => {
    if (isDevelopmentLogin || resendIn > 0 || busy) return;
    setError(null);
    setNotice(null);
    setBusy('resend');
    try {
      await signIn('resend-otp', { email: pendingEmail.address });
      markCodeResent();
      setCode('');
      setNow(Date.now());
      setNotice('A new code is on its way. Only the newest code will work.');
    } catch (err) {
      setError(emailDeliveryError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <OnboardingShell
      hideProgress
      title="Enter your sign-in code."
      hint={isDevelopmentLogin
        ? `Use the development sign-in code for ${pendingEmail.address}.`
        : `We sent an 8-digit code to ${pendingEmail.address}.`}
      footer={(
        <PrimaryButton
          arrow={false}
          disabled={code.length !== OTP_CODE_LENGTH || busy !== null}
          label={busy === 'verify' ? 'Signing you in…' : 'Verify and continue'}
          onPress={verify}
        />
      )}
    >
      <OtpCodeInput
        accessibilityHint={isDevelopmentLogin
          ? 'Enter or paste the development sign-in code'
          : 'Enter or paste the code sent to your email'}
        disabled={busy !== null}
        invalid={Boolean(error)}
        onChange={(value) => {
          setCode(value);
          if (error) setError(null);
        }}
        value={code}
      />

      {error ? <Text accessibilityRole="alert" style={[styles.message, { color: t.danger }]}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: t.success }]}>{notice}</Text> : null}

      <View style={[styles.deliveryNote, { backgroundColor: t.soft, borderColor: t.line }]}>
        <Text style={[styles.noteTitle, { color: t.ink }]}>{isDevelopmentLogin ? 'Local test access' : 'Use the newest code'}</Text>
        <Text style={[styles.noteBody, { color: t.muted }]}>
          {isDevelopmentLogin
            ? 'No email was sent. Use the fixed code configured for this development environment.'
            : 'Requesting another code makes the previous one invalid. Codes expire after 15 minutes.'}
        </Text>
      </View>

      <View style={styles.links}>
        {!isDevelopmentLogin ? (
          <Pressable
            accessibilityRole="button"
            disabled={resendIn > 0 || busy !== null}
            hitSlop={8}
            onPress={resend}
            style={({ pressed }) => ({ opacity: resendIn > 0 || busy !== null ? 0.5 : pressed ? 0.65 : 1 })}
          >
            <Text style={[styles.link, { color: t.accent }]}>
              {busy === 'resend' ? 'Sending a new code…' : resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" disabled={busy !== null} hitSlop={8} onPress={changeEmail}>
          {({ pressed }) => <Text style={[styles.link, { color: t.ink, opacity: busy !== null ? 0.5 : pressed ? 0.65 : 1 }]}>Change email</Text>}
        </Pressable>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  message: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, marginTop: 2 },
  deliveryNote: { borderRadius: radius.lg, borderWidth: 1, marginTop: 12, padding: 15 },
  noteTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  noteBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 4 },
  links: { alignItems: 'flex-start', gap: 16, marginTop: 14 },
  link: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 22 },
});

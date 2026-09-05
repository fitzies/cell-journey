import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { CodeInput, LoadingState, Note, OnboardingShell, OptionPill } from '@/components/onboarding/ui';
import { useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

export default function GroupCodeScreen() {
  const t = useAppTheme();
  const context = useQuery(api.profiles.currentContext, {});
  const [step, setStep] = useState<'code' | 'review'>('code');
  const [code, setCode] = useState('');
  const matched = useQuery(api.groups.previewGroupByCode, code.trim().length >= 3 ? { code } : 'skip');
  const join = useMutation(api.groups.requestToJoinByCode);
  const [busy, setBusy] = useState(false);

  if (context === undefined) return <LoadingState />;
  const hasMembership = context.memberGroups.length > 0;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(hasMembership ? '/profile?mode=member' : '/(onboarding)/profile');
  };

  const submit = async () => {
    setBusy(true);
    try {
      await join({ code });
      router.replace(hasMembership ? '/profile?mode=member' : '/(onboarding)/pending');
    } catch (err) {
      Alert.alert('Could not request to join', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'review' && matched) {
    return (
      <OnboardingShell
        animationKey="review"
        progress={1}
        title="Is this your cell group?"
        hint="Check before sending your request."
        cta={busy ? 'Sending…' : 'Request to join'}
        ctaDisabled={busy}
        onBack={() => setStep('code')}
        onCta={submit}
      >
        <Note badge="TE" title={matched.name} body={matched.leaderName ?? 'Leader'} />
        <View style={{ gap: 9 }}>
          <OptionPill selected label="This is my group" onPress={() => {}} />
          <OptionPill mark="←" label="Try a different code" onPress={() => setStep('code')} />
        </View>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      animationKey="code"
      progress={4 / 6}
      title={hasMembership ? 'Join another group.' : 'Enter your cell code.'}
      hint="Your leader shares the code, then approves your request."
      cta="Find group"
      ctaDisabled={!matched || busy}
      onBack={goBack}
      onCta={() => matched && setStep('review')}
      bottomContent={<Note badge="#" title="Where do I get this?" body="Ask the cell leader or coordinator for the six-character code." />}
    >
      <CodeInput value={code} onChangeText={setCode} length={6} />
      {code.trim().length >= 3 && !matched
        ? <Note badge="?" title="Code not working?" body="Check the spelling or ask the cell leader for a fresh code." />
        : <Text style={{ color: t.muted, fontSize: 13 }}> </Text>}
    </OnboardingShell>
  );
}

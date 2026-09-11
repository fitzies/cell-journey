import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { CodeInput, LoadingState, Note, OnboardingShell, OptionPill } from '@/components/onboarding/ui';
import { useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';
import { groupJoinError } from '@/lib/email-auth';

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
  const alreadyJoined = Boolean(matched && context.memberGroups.some(({ group }) => group._id === matched._id));
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(hasMembership ? '/profile?mode=member' : '/(onboarding)/profile');
  };

  const submit = async () => {
    if (busy || alreadyJoined) return;
    setBusy(true);
    try {
      await join({ code });
      router.replace(hasMembership ? '/profile?mode=member' : '/(onboarding)/pending');
    } catch (err) {
      Alert.alert('Could not request to join', groupJoinError(err));
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
        ctaDisabled={busy || alreadyJoined}
        onBack={() => setStep('code')}
        onCta={submit}
      >
        <Note badge="TE" title={matched.name} body={matched.leaderName ?? 'Leader'} />
        {alreadyJoined ? <Note badge="✓" title="Already joined" body="You're already a member of this group. Try a different group code." /> : null}
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

import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { CodeInput, LoadingState, Note, OnboardingShell, OptionPill } from '@/components/onboarding/ui';
import { useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

export default function GroupCodeScreen() {
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreview = preview === '1';
  const t = useAppTheme();
  const profile = useQuery(api.profiles.current, isPreview ? 'skip' : {});
  const [step, setStep] = useState<'code' | 'review'>('code');
  const [code, setCode] = useState('');
  const group = useQuery(api.groups.previewGroupByCode, !isPreview && code.trim().length >= 3 ? { code } : 'skip');
  const join = useMutation(api.groups.requestToJoinByCode);
  const [busy, setBusy] = useState(false);
  const matched = isPreview && code.trim().length >= 3 ? { name: 'Thursday East Cell', leaderName: 'Amelia Lim' } : group;
  if (!isPreview && profile === undefined) return <LoadingState />;
  if (step === 'review' && matched) return <OnboardingShell animationKey="review" progress={1} eyebrow="CONFIRM GROUP" title="Is this your cell group?" hint="Check before sending your request." cta={busy ? 'Sending…' : 'Request to join'} ctaDisabled={busy} onBack={() => setStep('code')} onCta={async () => { setBusy(true); if (!isPreview) await join({ code }); router.replace(isPreview ? '/(onboarding)/pending?preview=1' : '/(onboarding)/pending'); }}><Note badge="TE" title={matched.name} body={`${matched.leaderName ?? 'Leader'} · Tampines / Bedok`} /><View style={{ gap: 9 }}><OptionPill selected label="This is my group" onPress={() => {}} /><OptionPill mark="←" label="Try a different code" onPress={() => setStep('code')} /></View></OnboardingShell>;
  return <OnboardingShell animationKey="code" progress={5 / 6} eyebrow="GROUP CODE" title="Enter your cell code." hint="This keeps groups private. Your leader shares the code, then approves your request." cta="Find group" ctaDisabled={!matched || busy} onBack={() => router.replace(isPreview ? '/(onboarding)/profile?preview=1' : '/(onboarding)/profile')} onCta={() => matched && setStep('review')} bottomContent={<Note badge="#" title="Where do I get this?" body="Ask your cell leader or coordinator. It is usually a short mix of letters and numbers." />}><CodeInput value={code} onChangeText={setCode} length={6} />{code.trim().length >= 3 && !matched ? <Note badge="?" title="Code not working?" body="Check the spelling or ask your cell leader for a fresh code." /> : <Text style={{ color: t.muted, fontSize: 13 }}> </Text>}</OnboardingShell>;
}

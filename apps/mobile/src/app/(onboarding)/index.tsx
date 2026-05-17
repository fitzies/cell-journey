import { useMutation, useQuery } from 'convex/react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { BodyText, LoadingState, Note, OnboardingShell } from '@/components/onboarding/ui';
import { api } from '@/lib/api';

export default function OnboardingGate() {
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreview = preview === '1';
  const profile = useQuery(api.profiles.currentOrNull, isPreview ? 'skip' : {});
  const create = useMutation(api.profiles.getOrCreateCurrent);
  useEffect(() => { if (!isPreview && profile === null) router.replace('/(auth)'); }, [profile, isPreview]);
  if (isPreview) return <Handoff preview />;
  if (profile === undefined) return <LoadingState />;
  if (!profile) return <OnboardingShell eyebrow="WELCOME" title="Welcome to Cell Journey." hint="A quiet way to join your cell group and mark attendance." cta="Sign in first" onCta={() => router.replace('/(auth)')} />;
  if (profile.onboardingStatus === 'approved') return <Redirect href={profile.role === 'leader' ? '/(leader-tabs)' : '/(member-tabs)'} />;
  if (profile.onboardingStatus === 'pendingApproval') return <Redirect href="/(onboarding)/pending" />;
  if (profile.onboardingStatus === 'needsGroup') return <Redirect href="/(onboarding)/group-code" />;
  return <Handoff onBegin={async () => { await create(); router.push('/(onboarding)/profile'); }} />;
}

function Handoff({ preview, onBegin }: { preview?: boolean; onBegin?: () => void }) {
  return <OnboardingShell progress={1 / 6} animationKey="handoff" eyebrow="SIGNED IN" title="Set up your cell profile." hint="A few details before you join your group." cta="Begin profile" onCta={onBegin ?? (() => router.push('/(onboarding)/profile?preview=1'))}>
    <Note badge="CJ" title="Preview mode" body={preview ? 'Auth will connect later' : 'Signed in'} />
    <BodyText>We’ll keep this short.</BodyText>
  </OnboardingShell>;
}

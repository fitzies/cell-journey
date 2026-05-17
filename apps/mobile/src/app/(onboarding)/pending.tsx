import { useQuery } from 'convex/react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { LoadingState, Note, OnboardingShell, PrimaryButton } from '@/components/onboarding/ui';
import { api } from '@/lib/api';

export default function PendingScreen() {
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreview = preview === '1';
  const profile = useQuery(api.profiles.current, isPreview ? 'skip' : {});
  const pending = useQuery(api.groups.myPendingJoinRequest, isPreview ? 'skip' : {});
  if (!isPreview && (profile === undefined || pending === undefined)) return <LoadingState />;
  if (profile?.onboardingStatus === 'approved') return <Redirect href="/(member-tabs)" />;
  if (profile?.onboardingStatus === 'needsGroup') return <Redirect href="/(onboarding)/group-code" />;
  const name = isPreview ? 'Thursday East Cell' : (pending?.group?.name ?? 'Your cell group');
  return <OnboardingShell pending animationKey="pending" eyebrow="REQUEST SENT" title="Waiting for leader approval." hint="You’ll stay here until your leader approves you." footer={<PrimaryButton ghost label="Change group code" onPress={() => router.replace(isPreview ? '/(onboarding)/group-code?preview=1' : '/(onboarding)/group-code')} />}>
    <View style={{ marginTop: 4 }}><Note badge="TE" title={name} body="Leader notified" /></View>
  </OnboardingShell>;
}

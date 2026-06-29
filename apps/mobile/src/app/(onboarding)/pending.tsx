import { useQuery } from 'convex/react';
import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { LoadingState, Note, OnboardingShell, PrimaryButton } from '@/components/onboarding/ui';
import { api } from '@/lib/api';

export default function PendingScreen() {
  const profile = useQuery(api.profiles.current, {});
  const pending = useQuery(api.groups.myPendingJoinRequest, {});
  if (profile === undefined || pending === undefined) return <LoadingState />;
  if (profile?.role === 'leader') {
    if (!profile.fullName?.trim() || !profile.singaporeRegion || profile.serviceIds.length === 0) {
      return <Redirect href="/(onboarding)/profile" />;
    }
    return <Redirect href={profile.leaderGroupId ? '/(leader-tabs)' : '/(onboarding)/leader-setup'} />;
  }
  if (profile?.onboardingStatus === 'approved') return <Redirect href="/(member-tabs)" />;
  if (profile?.onboardingStatus === 'needsGroup') return <Redirect href="/(onboarding)/group-code" />;
  const name = pending?.group?.name ?? 'Your cell group';
  return <OnboardingShell pending animationKey="pending" eyebrow="REQUEST SENT" title="Waiting for leader approval." hint="You’ll stay here until your leader approves you." footer={<PrimaryButton ghost label="Change group code" onPress={() => router.replace('/(onboarding)/group-code')} />}>
    <View style={{ marginTop: 4 }}><Note badge="TE" title={name} body="Leader notified" /></View>
  </OnboardingShell>;
}

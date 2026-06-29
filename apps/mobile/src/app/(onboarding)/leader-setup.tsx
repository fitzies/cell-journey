import { useQuery } from 'convex/react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { LoadingState, Note, OnboardingShell } from '@/components/onboarding/ui';
import { api } from '@/lib/api';

export default function LeaderSetupScreen() {
  const profile = useQuery(api.profiles.current, {});

  if (profile === undefined) return <LoadingState />;
  if (!profile) return <Redirect href="/(auth)" />;
  if (profile.role !== 'leader') return <Redirect href="/(onboarding)" />;
  if (!profile.fullName?.trim() || !profile.singaporeRegion || profile.serviceIds.length === 0) {
    return <Redirect href="/(onboarding)/profile" />;
  }
  if (profile.leaderGroupId) return <Redirect href="/(leader-tabs)" />;

  return (
    <OnboardingShell
      pending
      animationKey="leader-setup"
      eyebrow="LEADER SETUP"
      title="Your leader account is almost ready."
      hint="Your group assignment needs to be configured before you can use the leader dashboard."
    >
      <View style={{ marginTop: 4 }}>
        <Note badge="CJ" title="Waiting for group assignment" body="Ask the app owner to assign your leader profile to a cell group in Convex." />
      </View>
    </OnboardingShell>
  );
}

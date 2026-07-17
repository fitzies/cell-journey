import { useQuery } from 'convex/react';
import { Redirect } from 'expo-router';
import { LoadingState } from '@/components/onboarding/ui';
import { api } from '@/lib/api';

/** Compatibility route retained for old links. Capabilities now come from relationships. */
export default function LeaderSetupScreen() {
  const context = useQuery(api.profiles.currentContext, {});
  if (context === undefined) return <LoadingState />;
  if (!context.profileComplete) return <Redirect href="/(onboarding)/profile" />;
  if (context.ledGroups.length > 0) return <Redirect href="/(leader-tabs)" />;
  if (context.memberGroups.length > 0) return <Redirect href="/(member-tabs)" />;
  if (context.pendingRequests.length > 0) return <Redirect href="/(onboarding)/pending" />;
  return <Redirect href="/(onboarding)/group-code" />;
}

import { useConvexAuth, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { api } from '@/lib/api';

export default function ProfileScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.currentOrNull, isAuthenticated ? {} : 'skip');
  const { context } = useGroups();

  if (isLoading || (isAuthenticated && (profile === undefined || context === undefined))) {
    return <LoadingState />;
  }
  if (!isAuthenticated) return <Redirect href="/(auth)" />;
  if (profile === null) return <Redirect href="/(onboarding)" />;

  if (mode === 'leader' && context?.ledGroups.length) return <Redirect href="/(leader-tabs)/profile" />;
  if (context?.memberGroups.length) return <Redirect href="/(member-tabs)/profile" />;
  if (context?.ledGroups.length) return <Redirect href="/(leader-tabs)/profile" />;
  return <Redirect href="/(onboarding)" />;
}

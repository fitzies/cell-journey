import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { LoadingState } from '@/components/onboarding/ui';
import { api } from '@/lib/api';

export default function OnboardingGate() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.currentOrNull, isAuthenticated ? {} : 'skip');
  const context = useQuery(api.profiles.currentContext, isAuthenticated && profile ? {} : 'skip');
  const create = useMutation(api.profiles.getOrCreateCurrent);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || profile !== null || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    create()
      .then(() => router.replace('/(onboarding)/profile'))
      .catch(() => { bootstrappedRef.current = false; });
  }, [create, isAuthenticated, profile]);

  if (isLoading) return <LoadingState />;
  if (!isAuthenticated) return <Redirect href="/(auth)" />;
  if (profile === undefined || profile === null || context === undefined) return <LoadingState />;
  if (!context.profileComplete) return <Redirect href="/(onboarding)/profile" />;
  if (context.memberGroups.length > 0) return <Redirect href="/(member-tabs)/home" />;
  if (context.ledGroups.length > 0) return <Redirect href="/(leader-tabs)/home" />;
  if (context.pendingRequests.length > 0) return <Redirect href="/(onboarding)/pending" />;
  return <Redirect href="/(onboarding)/group-code" />;
}

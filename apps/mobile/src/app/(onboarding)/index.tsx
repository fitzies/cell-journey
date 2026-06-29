import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { LoadingState } from '@/components/onboarding/ui';
import { api } from '@/lib/api';

export default function OnboardingGate() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.currentOrNull, isAuthenticated ? {} : 'skip');
  const create = useMutation(api.profiles.getOrCreateCurrent);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (profile !== null) return;
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    create()
      .then(() => router.replace('/(onboarding)/profile'))
      .catch(() => {
        bootstrappedRef.current = false;
      });
  }, [create, isAuthenticated, profile]);

  if (isLoading) return <LoadingState />;
  if (!isAuthenticated) return <Redirect href="/(auth)" />;
  if (profile === undefined || profile === null) return <LoadingState />;
  if (profile.role === 'leader') {
    if (!profile.fullName?.trim() || !profile.singaporeRegion || profile.serviceIds.length === 0) {
      return <Redirect href="/(onboarding)/profile" />;
    }
    return <Redirect href={profile.leaderGroupId ? '/(leader-tabs)' : '/(onboarding)/leader-setup'} />;
  }
  if (profile.onboardingStatus === 'approved') return <Redirect href="/(member-tabs)" />;
  if (profile.onboardingStatus === 'pendingApproval') return <Redirect href="/(onboarding)/pending" />;
  if (profile.onboardingStatus === 'needsGroup') return <Redirect href="/(onboarding)/group-code" />;
  return <Redirect href="/(onboarding)/profile" />;
}

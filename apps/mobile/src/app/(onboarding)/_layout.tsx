import { useConvexAuth } from 'convex/react';
import { Redirect, Stack } from 'expo-router';
import { LoadingState } from '@/components/onboarding/ui';

export default function OnboardingLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <LoadingState />;
  if (!isAuthenticated) return <Redirect href="/(auth)" />;
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}

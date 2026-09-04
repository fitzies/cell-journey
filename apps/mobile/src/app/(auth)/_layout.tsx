import { useConvexAuth } from 'convex/react';
import { Redirect, Stack } from 'expo-router';
import { EmailOtpProvider } from '@/components/auth/email-otp-context';
import { LoadingState } from '@/components/onboarding/ui';

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) return <LoadingState />;
  if (isAuthenticated) return <Redirect href="/(onboarding)" />;

  return (
    <EmailOtpProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </EmailOtpProvider>
  );
}

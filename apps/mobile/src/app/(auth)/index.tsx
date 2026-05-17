import { router } from 'expo-router';
import { BodyText, OnboardingShell, PrimaryButton } from '@/components/onboarding/ui';

export default function AuthScreen() {
  return <OnboardingShell eyebrow="Cell Journey" title="Preview onboarding" footer={<PrimaryButton label="Preview without auth" onPress={() => router.replace('/(onboarding)/profile?preview=1')} />}><BodyText>Auth is not wired yet. For now, preview the onboarding UI without calling Convex Auth.</BodyText></OnboardingShell>;
}

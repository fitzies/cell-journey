import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Chip, Field, LoadingState, OnboardingShell, OptionPill } from '@/components/onboarding/ui';
import { api, Id } from '@/lib/api';

const regions = ['north', 'south', 'east', 'west', 'central', 'northeast', 'northwest', 'southeast', 'southwest'] as const;
const labels: Record<typeof regions[number], string> = { north: '✦ North', south: '◐ South', east: '◇ East', west: '◌ West', central: '● Central', northeast: '✧ Northeast', northwest: '□ Northwest', southeast: '◍ Southeast', southwest: '○ Southwest' };

export default function ProfileScreen() {
  const profile = useQuery(api.profiles.current, {});
  const services = useQuery(api.groups.listServices, {});
  const update = useMutation(api.profiles.updateOnboardingProfile);
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const preferredName = profile?.preferredName ?? undefined;
  const [region, setRegion] = useState<typeof regions[number] | null>(profile?.singaporeRegion ?? null);
  const [selected, setSelected] = useState<Id<'services'>[]>(profile?.serviceIds ?? []);
  const [saving, setSaving] = useState(false);
  if (profile === undefined || services === undefined) return <LoadingState />;
  const rows = services ?? [];
  const next = async () => {
    if (step < 2) return setStep(step + 1);
    if (!region) return;
    setSaving(true);
    try {
      const updated = await update({ fullName, preferredName: preferredName || undefined, singaporeRegion: region, serviceIds: selected });
      if (updated?.role === 'leader') {
        router.replace(updated.leaderGroupId ? '/(leader-tabs)' : '/(onboarding)/leader-setup');
        return;
      }
      router.replace('/(onboarding)/group-code');
    } finally {
      setSaving(false);
    }
  };
  const back = () => setStep(step - 1);
  const disabled = (step === 0 && !fullName.trim()) || (step === 1 && selected.length === 0) || (step === 2 && !region) || saving;
  const common = { onBack: step > 0 ? back : undefined, fullWidthProgress: step === 0, onCta: next, cta: saving ? 'Saving…' : 'Continue', ctaDisabled: disabled, progress: (step + 1) / 6, animationKey: step };
  if (step === 0) return <OnboardingShell {...common} eyebrow="YOUR NAME" title="What’s your full name?" hint="Use the name your leader would know."><Field value={fullName} onChangeText={setFullName} autoCapitalize="words" autoFocus /></OnboardingShell>;
  if (step === 1) return <OnboardingShell {...common} eyebrow="SERVICES" title="Which service do you attend?" hint="Pick one or more."><View style={{ gap: 9 }}>{rows.map(s => <OptionPill key={s._id} label={s.name} selected={selected.includes(s._id)} onPress={() => setSelected(x => x.includes(s._id) ? x.filter(id => id !== s._id) : [...x, s._id])} />)}</View></OnboardingShell>;
  return <OnboardingShell {...common} eyebrow="REGION" title="Where are you based?" hint="Choose your Singapore region."><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{regions.map(r => <Chip key={r} label={labels[r]} selected={region === r} onPress={() => setRegion(r)} />)}</View></OnboardingShell>;
}

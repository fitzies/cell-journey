import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Chip, Field, LoadingState, OnboardingShell, OptionPill } from '@/components/onboarding/ui';
import { api, Id } from '@/lib/api';

const regions = ['north', 'south', 'east', 'west', 'central', 'northeast', 'northwest', 'southeast', 'southwest'] as const;
const labels: Record<typeof regions[number], string> = { north: '✦ North', south: '◐ South', east: '◇ East', west: '◌ West', central: '● Central', northeast: '✧ Northeast', northwest: '□ Northwest', southeast: '◍ Southeast', southwest: '○ Southwest' };
const mockServices = [{ _id: 'sat-5' as Id<'services'>, name: 'Saturday 5 PM' }, { _id: 'sun-10' as Id<'services'>, name: 'Sunday 10 AM' }, { _id: 'sun-12' as Id<'services'>, name: 'Sunday 12 PM' }, { _id: 'online' as Id<'services'>, name: 'Online service' }];

export default function ProfileScreen() {
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreview = preview === '1';
  const profile = useQuery(api.profiles.current, isPreview ? 'skip' : {});
  const services = useQuery(api.groups.listServices, isPreview ? 'skip' : {});
  const update = useMutation(api.profiles.updateOnboardingProfile);
  const rows = useMemo(() => isPreview ? mockServices : (services ?? []), [isPreview, services]);
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const preferredName = profile?.preferredName ?? undefined;
  const [region, setRegion] = useState<typeof regions[number] | null>(profile?.singaporeRegion ?? null);
  const [selected, setSelected] = useState<Id<'services'>[]>(profile?.serviceIds ?? []);
  const [saving, setSaving] = useState(false);
  if (!isPreview && (profile === undefined || services === undefined)) return <LoadingState />;
  const next = async () => {
    if (step < 2) return setStep(step + 1);
    if (!region) return;
    setSaving(true);
    if (!isPreview) await update({ fullName, preferredName: preferredName || undefined, singaporeRegion: region, serviceIds: selected });
    router.push(isPreview ? '/(onboarding)/group-code?preview=1' : '/(onboarding)/group-code');
  };
  const back = step ? () => setStep(step - 1) : () => router.replace(isPreview ? '/(onboarding)?preview=1' : '/(onboarding)');
  const disabled = (step === 0 && !fullName.trim()) || (step === 1 && selected.length === 0) || (step === 2 && !region) || saving;
  const common = { onBack: back, onCta: next, cta: saving ? 'Saving…' : 'Continue', ctaDisabled: disabled, progress: (step + 2) / 6, animationKey: step };
  if (step === 0) return <OnboardingShell {...common} eyebrow="YOUR NAME" title="What’s your full name?" hint="Use the name your leader would know."><Field value={fullName} onChangeText={setFullName} autoCapitalize="words" autoFocus /></OnboardingShell>;
  if (step === 1) return <OnboardingShell {...common} eyebrow="SERVICES" title="Which service do you attend?" hint="Pick one or more."><View style={{ gap: 9 }}>{rows.map(s => <OptionPill key={s._id} label={s.name} selected={selected.includes(s._id)} onPress={() => setSelected(x => x.includes(s._id) ? x.filter(id => id !== s._id) : [...x, s._id])} />)}</View></OnboardingShell>;
  return <OnboardingShell {...common} eyebrow="REGION" title="Where are you based?" hint="Choose your Singapore region."><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{regions.map(r => <Chip key={r} label={labels[r]} selected={region === r} onPress={() => setRegion(r)} />)}</View></OnboardingShell>;
}

import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Chip, LoadingState, OnboardingShell, OptionPill } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api, Id } from '@/lib/api';

const regions = ['north', 'south', 'east', 'west', 'central', 'northeast', 'northwest', 'southeast', 'southwest'] as const;
const labels: Record<typeof regions[number], string> = { north: '✦ North', south: '◐ South', east: '◇ East', west: '◌ West', central: '● Central', northeast: '✧ Northeast', northwest: '□ Northwest', southeast: '◍ Southeast', southwest: '○ Southwest' };

export default function ProfileScreen() {
  const t = useAppTheme();
  const profile = useQuery(api.profiles.current, {});
  const services = useQuery(api.groups.listServices, {});
  const update = useMutation(api.profiles.updateOnboardingProfileV2);
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [region, setRegion] = useState<typeof regions[number] | null>(null);
  const [selected, setSelected] = useState<Id<'services'>[]>([]);
  const [saving, setSaving] = useState(false);
  const hydratedProfileId = useRef<string | null>(null);
  const lastNameInput = useRef<TextInput>(null);

  useEffect(() => {
    if (!profile || hydratedProfileId.current === profile._id) return;
    hydratedProfileId.current = profile._id;
    setFirstName(profile.firstName ?? '');
    setLastName(profile.lastName ?? '');
    setRegion(profile.singaporeRegion ?? null);
    setSelected(profile.serviceIds);
  }, [profile]);

  if (profile === undefined || services === undefined) return <LoadingState />;

  const rows = services ?? [];
  const next = async () => {
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    if (!region) return;
    setSaving(true);
    try {
      await update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        preferredName: profile?.preferredName?.trim() || undefined,
        singaporeRegion: region,
        serviceIds: selected,
      });
      router.replace('/(onboarding)');
    } catch (err) {
      Alert.alert('Could not save your profile', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };
  const back = () => setStep(step - 1);
  const hasName = Boolean(firstName.trim() && lastName.trim());
  const disabled = (step === 0 && !hasName) || (step === 1 && selected.length === 0) || (step === 2 && !region) || saving;
  const common = { onBack: step > 0 ? back : undefined, fullWidthProgress: step === 0, onCta: next, cta: saving ? 'Saving…' : 'Continue', ctaDisabled: disabled, progress: (step + 1) / 6, animationKey: step };

  if (step === 0) {
    return (
      <OnboardingShell {...common} eyebrow="YOUR NAME" title="What’s your name?" hint="Enter your first and last name as your leader would know them.">
        <View style={styles.nameFields}>
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: t.muted }]}>First name</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => lastNameInput.current?.focus()}
              placeholder="First name"
              placeholderTextColor={t.muted}
              style={[styles.input, { backgroundColor: t.surface, borderColor: t.line, color: t.ink }]}
              autoFocus
            />
          </View>
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: t.muted }]}>Last name</Text>
            <TextInput
              ref={lastNameInput}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoComplete="family-name"
              textContentType="familyName"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (hasName) void next();
              }}
              placeholder="Last name"
              placeholderTextColor={t.muted}
              style={[styles.input, { backgroundColor: t.surface, borderColor: t.line, color: t.ink }]}
            />
          </View>
        </View>
      </OnboardingShell>
    );
  }
  if (step === 1) {
    return (
      <OnboardingShell {...common} eyebrow="SERVICES" title="Which service do you attend?" hint="Pick one or more.">
        <View style={{ gap: 9 }}>
          {rows.map((service) => (
            <OptionPill
              key={service._id}
              label={service.name}
              selected={selected.includes(service._id)}
              onPress={() => setSelected((current) => current.includes(service._id) ? current.filter((id) => id !== service._id) : [...current, service._id])}
            />
          ))}
        </View>
      </OnboardingShell>
    );
  }
  return (
    <OnboardingShell {...common} eyebrow="REGION" title="Where are you based?" hint="Choose your Singapore region.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
        {regions.map((regionOption) => <Chip key={regionOption} label={labels[regionOption]} selected={region === regionOption} onPress={() => setRegion(regionOption)} />)}
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  nameFields: { gap: 16 },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  input: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: 16, minHeight: 60, fontFamily: fonts.display, fontSize: 23 },
});

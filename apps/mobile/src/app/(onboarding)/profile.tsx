import { getPostalDistrictFromSector } from '@cell-journey/domain';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { LoadingState, OnboardingShell, OptionPill } from '@/components/onboarding/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api, Id } from '@/lib/api';

export default function ProfileScreen() {
  const t = useAppTheme();
  const profile = useQuery(api.profiles.current, {});
  const services = useQuery(api.groups.listServices, {});
  const update = useMutation(api.profiles.updateOnboardingProfileV3);
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [postalSector, setPostalSector] = useState('');
  const [selected, setSelected] = useState<Id<'services'>[]>([]);
  const [saving, setSaving] = useState(false);
  const hydratedProfileId = useRef<string | null>(null);
  const lastNameInput = useRef<TextInput>(null);

  useEffect(() => {
    if (!profile || hydratedProfileId.current === profile._id) return;
    hydratedProfileId.current = profile._id;
    setFirstName(profile.firstName ?? '');
    setLastName(profile.lastName ?? '');
    setSelected(profile.serviceIds);
  }, [profile]);

  if (profile === undefined || services === undefined) return <LoadingState />;

  const rows = services ?? [];
  const next = async () => {
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    const district = getPostalDistrictFromSector(postalSector);
    if (!district) return;
    setSaving(true);
    try {
      await update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        preferredName: profile?.preferredName?.trim() || undefined,
        postalSector,
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
  const district = getPostalDistrictFromSector(postalSector);
  const disabled = (step === 0 && !hasName) || (step === 1 && selected.length === 0) || (step === 2 && !district) || saving;
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
    <OnboardingShell {...common} eyebrow="YOUR AREA" title="Where are you based?" hint="Enter the first two digits of your Singapore postal code." revealContentKey={postalSector.length === 2 ? postalSector : undefined}>
      <View style={styles.postalContent}>
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: t.muted }]}>First 2 postal digits</Text>
          <TextInput
            value={postalSector}
            onChangeText={(value) => setPostalSector(value.replace(/\D/g, '').slice(0, 2))}
            editable={!saving}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            returnKeyType="done"
            placeholder="52"
            placeholderTextColor={t.muted}
            accessibilityLabel="First two digits of postal code"
            style={[styles.postalInput, { backgroundColor: t.surface, borderColor: district ? t.accent : postalSector.length === 2 ? t.danger : t.line, color: t.ink }]}
            autoFocus
          />
          <Text style={[styles.postalHelper, { color: t.muted }]}>For example, enter 52 for postal code 520123. We save only your district.</Text>
        </View>

        {district ? (
          <View accessibilityLiveRegion="polite" style={[styles.districtCard, { backgroundColor: t.selected, borderColor: t.accent }]}>
            <Text style={[styles.districtEyebrow, { color: t.accent }]}>Your postal district</Text>
            <Text style={[styles.districtTitle, { color: t.ink }]}>District {district.number}</Text>
            <Text style={[styles.districtArea, { color: t.muted }]}>{district.area}</Text>
          </View>
        ) : postalSector.length === 2 ? (
          <Text accessibilityLiveRegion="polite" style={[styles.postalError, { color: t.danger }]}>We could not match those digits. Check your postal code and try again.</Text>
        ) : null}
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  nameFields: { gap: 16 },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  input: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: 16, minHeight: 60, fontFamily: fonts.display, fontSize: 23 },
  postalContent: { gap: 18 },
  postalInput: { width: 112, minHeight: 68, borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: 18, fontFamily: fonts.display, fontSize: 30, letterSpacing: 8, textAlign: 'center' },
  postalHelper: { maxWidth: 330, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20 },
  districtCard: { borderWidth: 1, borderRadius: radius.lg, padding: 17 },
  districtEyebrow: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase' },
  districtTitle: { marginTop: 7, fontFamily: fonts.display, fontSize: 25, letterSpacing: -0.5 },
  districtArea: { marginTop: 5, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21 },
  postalError: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, lineHeight: 19 },
});

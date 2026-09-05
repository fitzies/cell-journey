import { getPostalDistrictFromSector } from '@cell-journey/domain';
import { useMutation } from 'convex/react';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api, type Doc, type Id } from '@/lib/api';
import { getProfileLocationLabel } from '@/lib/profile-location';

export function EditProfileSheet({
  profile,
  services,
  onClose,
  onSaved,
}: {
  profile: Doc<'userProfiles'> | null;
  services: Doc<'services'>[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const updateProfile = useMutation(api.profiles.updateProfileV3);
  const savedFirstName = profile?.firstName?.trim() ?? '';
  const savedLastName = profile?.lastName?.trim() ?? '';
  const activeServiceIds = new Set(services.map((service) => service._id));
  const [firstName, setFirstName] = useState(savedFirstName);
  const [lastName, setLastName] = useState(savedLastName);
  const [legacyFullName] = useState<string | null>(
    !savedFirstName || !savedLastName ? profile?.fullName?.trim() || null : null,
  );
  const [postalSector, setPostalSector] = useState('');
  const [selected, setSelected] = useState<Id<'services'>[]>(
    () => profile?.serviceIds.filter((serviceId) => activeServiceIds.has(serviceId)) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const lastNameInput = useRef<TextInput>(null);

  const toggleService = (serviceId: Id<'services'>) => {
    if (saving) return;
    setSelected((current) => (current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]));
  };

  const submit = async () => {
    if (!profile || saving) return;
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    if (!trimmedFirstName) {
      Alert.alert('Add your first name', 'Enter your first name as your leader or members would recognise it.');
      return;
    }
    if (!trimmedLastName) {
      Alert.alert('Add your last name', 'Enter your last name rather than relying on the old full-name field.');
      return;
    }
    if (selected.length === 0) {
      Alert.alert('Choose at least one service', 'Your service helps leaders understand your regular rhythm.');
      return;
    }
    const district = postalSector ? getPostalDistrictFromSector(postalSector) : null;
    if (postalSector && !district) {
      Alert.alert('Check your postal digits', 'Enter the first two digits of a valid Singapore postal code.');
      return;
    }
    if (!district && !profile.postalDistrict && !profile.singaporeRegion) {
      Alert.alert('Add your postal district', 'Enter the first two digits of your Singapore postal code.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        preferredName: profile.preferredName?.trim() || undefined,
        postalSector: postalSector || undefined,
        serviceIds: selected,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      Alert.alert('Could not save profile', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const district = getPostalDistrictFromSector(postalSector);
  const hasSavedLocation = Boolean(profile?.postalDistrict || profile?.singaporeRegion);
  const hasValidLocation = postalSector.length === 0 ? hasSavedLocation : Boolean(district);
  const canSave = Boolean(firstName.trim() && lastName.trim() && hasValidLocation && selected.length > 0 && !saving && profile);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={saving ? undefined : onClose} />
        <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.line, paddingBottom: Math.max(18, insets.bottom + 10) }]}>
          <View style={[styles.sheetHandle, { backgroundColor: t.line }]} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: t.ink }]}>Edit profile</Text>
            </View>
            <Pressable disabled={saving} onPress={onClose} hitSlop={10} style={({ pressed }) => [styles.closeButton, { backgroundColor: t.soft, opacity: saving ? 0.45 : 1, transform: [{ scale: pressed && !saving ? 0.96 : 1 }] }]}>
              <Text style={[styles.closeText, { color: t.ink }]}>×</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
            {legacyFullName ? (
              <View style={[styles.nameNotice, { backgroundColor: t.soft, borderColor: t.line }]}>
                <Text style={[styles.nameNoticeTitle, { color: t.ink }]}>Confirm your name</Text>
                <Text style={[styles.nameNoticeBody, { color: t.muted }]}>We currently show “{legacyFullName}”. Add your first and last names below—we won’t guess how your name should be split.</Text>
              </View>
            ) : null}

            <View style={styles.nameRow}>
              <View style={[styles.fieldWrap, styles.nameField]}>
                <Text style={[styles.label, { color: t.muted }]}>First name</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  editable={!saving}
                  autoCapitalize="words"
                  autoComplete="given-name"
                  textContentType="givenName"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => lastNameInput.current?.focus()}
                  placeholder="First name"
                  placeholderTextColor={t.muted}
                  style={[styles.input, { backgroundColor: t.background, borderColor: t.line, color: t.ink }]}
                />
              </View>
              <View style={[styles.fieldWrap, styles.nameField]}>
                <Text style={[styles.label, { color: t.muted }]}>Last name</Text>
                <TextInput
                  ref={lastNameInput}
                  value={lastName}
                  onChangeText={setLastName}
                  editable={!saving}
                  autoCapitalize="words"
                  autoComplete="family-name"
                  textContentType="familyName"
                  returnKeyType="done"
                  placeholder="Last name"
                  placeholderTextColor={t.muted}
                  style={[styles.input, { backgroundColor: t.background, borderColor: t.line, color: t.ink }]}
                />
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={[styles.label, { color: t.muted }]}>Services attending</Text>
              <View style={styles.optionList}>
                {services.map((service) => (
                  <ChoiceRow key={service._id} label={service.name} selected={selected.includes(service._id)} disabled={saving} onPress={() => toggleService(service._id)} />
                ))}
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={[styles.label, { color: t.muted }]}>Postal district</Text>
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
                style={[styles.input, styles.postalInput, { backgroundColor: t.background, borderColor: district ? t.accent : postalSector.length === 2 ? t.danger : t.line, color: t.ink }]}
              />
              <Text style={[styles.helper, { color: t.muted }]}>Enter 52 for a postal code such as 520123. We use the digits to find your district, then discard them.</Text>
              {district ? (
                <View accessibilityLiveRegion="polite" style={[styles.locationCard, { backgroundColor: t.selected, borderColor: t.accent }]}>
                  <Text style={[styles.locationTitle, { color: t.ink }]}>District {district.number}</Text>
                  <Text style={[styles.locationArea, { color: t.muted }]}>{district.area}</Text>
                </View>
              ) : postalSector.length === 2 ? (
                <Text accessibilityLiveRegion="polite" style={[styles.locationError, { color: t.danger }]}>We could not match those digits. Check your postal code.</Text>
              ) : hasSavedLocation ? (
                <View style={[styles.currentLocation, { backgroundColor: t.soft, borderColor: t.line }]}>
                  <Text style={[styles.currentLocationLabel, { color: t.muted }]}>Current area</Text>
                  <Text style={[styles.currentLocationValue, { color: t.ink }]}>{getProfileLocationLabel(profile)}</Text>
                  <Text style={[styles.currentLocationHint, { color: t.muted }]}>Leave this blank to keep it.</Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.helper, { color: t.muted }]}>Role and group assignment are managed separately, so attendance history stays intact.</Text>

            <View style={styles.actions}>
              <SheetButton filled label={saving ? 'Saving…' : 'Save changes'} disabled={!canSave} onPress={submit} />
              <SheetButton label="Cancel" disabled={saving} onPress={onClose} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ChoiceRow({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useAppTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceRow,
        {
          backgroundColor: selected ? t.selected : t.background,
          borderColor: selected ? t.accent : t.line,
          opacity: disabled ? 0.55 : 1,
          transform: [{ scale: pressed && !disabled ? 0.99 : 1 }],
        },
      ]}
    >
      <View style={[styles.check, { backgroundColor: selected ? t.accent : t.soft }]}>
        <Text style={[styles.checkText, { color: selected ? t.accentInk : t.accent }]}>{selected ? '✓' : ''}</Text>
      </View>
      <Text style={[styles.choiceText, { color: selected ? t.accent : t.ink }]}>{label}</Text>
    </Pressable>
  );
}

function SheetButton({ label, onPress, disabled, filled }: { label: string; onPress: () => void; disabled?: boolean; filled?: boolean }) {
  const t = useAppTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: filled ? t.accent : t.surface,
          borderColor: filled ? t.accent : t.line,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
        },
      ]}
    >
      <Text style={[styles.buttonText, { color: filled ? t.accentInk : t.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.34)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, paddingTop: 10, paddingHorizontal: 20 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 999, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetBody: { paddingTop: 18, paddingBottom: 8, gap: 18 },
  closeButton: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  closeText: { marginTop: -2, fontFamily: fonts.bodySemiBold, fontSize: 26, lineHeight: 28 },
  title: { fontFamily: fonts.bodyBold, fontSize: 20, letterSpacing: -0.4 },
  nameNotice: { borderWidth: 1, borderRadius: radius.lg, padding: 14 },
  nameNoticeTitle: { fontFamily: fonts.bodyBold, fontSize: 15, letterSpacing: -0.2 },
  nameNoticeBody: { marginTop: 5, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },
  nameRow: { gap: 14 },
  nameField: { width: '100%' },
  fieldWrap: { gap: 8 },
  label: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  optionList: { gap: 9 },
  choiceRow: { minHeight: 56, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  choiceText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15.5, letterSpacing: -0.2 },
  postalInput: { width: 112, fontSize: 22, letterSpacing: 6, textAlign: 'center' },
  locationCard: { borderWidth: 1, borderRadius: radius.lg, padding: 14 },
  locationTitle: { fontFamily: fonts.bodyBold, fontSize: 16, letterSpacing: -0.2 },
  locationArea: { marginTop: 4, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },
  locationError: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 18 },
  currentLocation: { borderWidth: 1, borderRadius: radius.lg, padding: 14 },
  currentLocationLabel: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  currentLocationValue: { marginTop: 5, fontFamily: fonts.bodySemiBold, fontSize: 14.5, lineHeight: 20 },
  currentLocationHint: { marginTop: 4, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18 },
  helper: { marginTop: -4, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  actions: { gap: 9 },
  button: { minHeight: 50, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, letterSpacing: -0.15 },
});

import { useMutation } from 'convex/react';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api, type Doc, type Id } from '@/lib/api';

type Region = NonNullable<Doc<'userProfiles'>['singaporeRegion']>;

const regions: Region[] = ['north', 'south', 'east', 'west', 'central', 'northeast', 'northwest', 'southeast', 'southwest'];

const regionLabels: Record<Region, string> = {
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
  central: 'Central',
  northeast: 'Northeast',
  northwest: 'Northwest',
  southeast: 'Southeast',
  southwest: 'Southwest',
};

export function EditProfileSheet({
  visible,
  profile,
  services,
  onClose,
  onSaved,
}: {
  visible: boolean;
  profile: Doc<'userProfiles'> | null;
  services: Doc<'services'>[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const updateProfile = useMutation(api.profiles.updateProfile);
  const [fullName, setFullName] = useState('');
  const [region, setRegion] = useState<Region | null>(null);
  const [selected, setSelected] = useState<Id<'services'>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !profile) return;
    const activeServiceIds = new Set(services.map((service) => service._id));
    setFullName(profile.fullName ?? '');
    setRegion(profile.singaporeRegion ?? null);
    setSelected(profile.serviceIds.filter((serviceId) => activeServiceIds.has(serviceId)));
  }, [profile, services, visible]);

  const toggleService = (serviceId: Id<'services'>) => {
    if (saving) return;
    setSelected((current) => (current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]));
  };

  const submit = async () => {
    if (!profile || saving) return;
    const trimmedFullName = fullName.trim();
    if (!trimmedFullName) {
      Alert.alert('Add your full name', 'Use the name your leader or members would recognise.');
      return;
    }
    if (selected.length === 0) {
      Alert.alert('Choose at least one service', 'Your service helps leaders understand your regular rhythm.');
      return;
    }
    if (!region) {
      Alert.alert('Choose your region', 'Select the Singapore region closest to where you are based.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        fullName: trimmedFullName,
        preferredName: profile.preferredName?.trim() || undefined,
        singaporeRegion: region,
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

  const canSave = Boolean(fullName.trim() && region && selected.length > 0 && !saving && profile);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={saving ? undefined : onClose} />
        <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.line, paddingBottom: Math.max(18, insets.bottom + 10) }]}>
          <View style={[styles.sheetHandle, { backgroundColor: t.line }]} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: t.accent }]}>Edit profile</Text>
              <Text style={[styles.title, { color: t.ink }]}>Keep your details current.</Text>
            </View>
            <Pressable disabled={saving} onPress={onClose} hitSlop={10} style={({ pressed }) => [styles.closeButton, { backgroundColor: t.soft, opacity: saving ? 0.45 : 1, transform: [{ scale: pressed && !saving ? 0.96 : 1 }] }]}>
              <Text style={[styles.closeText, { color: t.ink }]}>×</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
            <View style={styles.fieldWrap}>
              <Text style={[styles.label, { color: t.muted }]}>Full name</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                editable={!saving}
                autoCapitalize="words"
                returnKeyType="done"
                placeholder="Your full name"
                placeholderTextColor={t.muted}
                style={[styles.input, { backgroundColor: t.background, borderColor: t.line, color: t.ink }]}
              />
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
              <Text style={[styles.label, { color: t.muted }]}>Singapore region</Text>
              <View style={styles.regionGrid}>
                {regions.map((item) => (
                  <RegionChip key={item} label={regionLabels[item]} selected={region === item} disabled={saving} onPress={() => setRegion(item)} />
                ))}
              </View>
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

function RegionChip({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useAppTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.regionChip,
        {
          backgroundColor: selected ? t.selected : t.background,
          borderColor: selected ? t.accent : t.line,
          opacity: disabled ? 0.55 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
      ]}
    >
      <Text style={[styles.regionText, { color: selected ? t.accent : t.ink }]}>{label}</Text>
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
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.34)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, paddingTop: 10, paddingHorizontal: 20 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 999, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetBody: { paddingTop: 18, paddingBottom: 8, gap: 18 },
  closeButton: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  closeText: { marginTop: -2, fontFamily: fonts.bodySemiBold, fontSize: 26, lineHeight: 28 },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.7, textTransform: 'uppercase' },
  title: { marginTop: 6, fontFamily: fonts.bodyBold, fontSize: 20, letterSpacing: -0.4 },
  fieldWrap: { gap: 8 },
  label: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  optionList: { gap: 9 },
  choiceRow: { minHeight: 56, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  choiceText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15.5, letterSpacing: -0.2 },
  regionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  regionChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 11 },
  regionText: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, letterSpacing: -0.15 },
  helper: { marginTop: -4, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  actions: { gap: 9 },
  button: { minHeight: 50, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, letterSpacing: -0.15 },
});

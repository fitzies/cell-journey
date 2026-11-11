import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import {
  PersonalDetailsFields,
  personalDetailError,
  type PersonalDetailField,
  type PersonalDetailsValues,
} from '@/components/personal-details-fields';

const titles: Record<PersonalDetailField, string> = {
  dateOfBirth: 'Date of birth',
  sex: 'Sex',
  phone: 'Phone',
};

const hints: Record<PersonalDetailField, string> = {
  dateOfBirth: 'Optional. Visible to your group leaders.',
  sex: 'Optional. Tap the selected option again to clear it.',
  phone: 'Optional. A Singapore number your leaders can call.',
};

/** Edits one optional personal detail. Saving an empty value clears it. */
export function PersonalDetailDialog({ field, initial, onSave, onClose }: {
  field: PersonalDetailField;
  initial: PersonalDetailsValues;
  onSave: (values: PersonalDetailsValues) => Promise<void>;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const invalid = Boolean(personalDetailError(field, values));
  const canSave = !saving && !invalid;

  const close = () => { if (!savingRef.current) onClose(); };
  const submit = async () => {
    if (savingRef.current || invalid) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return <Modal visible transparent animationType="fade" onRequestClose={close}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View role="dialog" aria-modal accessibilityViewIsModal accessibilityLabel={titles[field]}
        style={[styles.dialog, { backgroundColor: t.surface }, surfaceShadow(t)]}>
        <Text accessibilityRole="header" style={[textStyles.title, { color: t.text }]}>{titles[field]}</Text>
        <Text style={[textStyles.body, { color: t.muted }]}>{hints[field]}</Text>
        <PersonalDetailsFields fields={[field]} values={values} disabled={saving} autoFocusPhone={field === 'phone'}
          onChange={(next) => { setError(null); setValues(next); }} />
        {error ? <Text accessibilityRole="alert" style={[textStyles.body, { color: t.danger }]}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable disabled={saving} aria-disabled={saving} accessibilityRole="button" onPress={close} style={styles.action}>
            <Text style={[textStyles.button, { color: saving ? t.muted : t.text }]}>Cancel</Text>
          </Pressable>
          <Pressable disabled={!canSave} aria-disabled={!canSave} accessibilityRole="button" onPress={() => { void submit(); }} style={styles.action}>
            <Text style={[textStyles.button, { color: canSave ? t.text : t.muted }]}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: spacing.xl },
  dialog: { width: '100%', maxWidth: 380, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  action: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
});

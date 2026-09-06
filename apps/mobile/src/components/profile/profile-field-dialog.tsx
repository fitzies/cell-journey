import { useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, spacing, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { useProfileFieldDraft, type ProfileFieldDialogProps } from './profile-field-model';

export function ProfileFieldDialog(props: ProfileFieldDialogProps) {
  const { field, services } = props;
  const t = useAppTheme();
  const draft = useProfileFieldDraft(props);
  const lastNameRef = useRef<TextInput>(null);
  const title = field === 'name' ? 'Name' : field === 'services' ? 'Services' : 'Postal district';
  const inputStyle = [styles.input, { backgroundColor: t.soft, color: t.text }];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={draft.close}>
      <View style={styles.backdrop}>
        <View
          role="dialog"
          aria-modal
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[styles.dialog, { backgroundColor: t.surface }, surfaceShadow(t)]}
        >
          <Text accessibilityRole="header" style={[textStyles.title, { color: t.text }]}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.fields}>
            {field === 'name' ? <>
              <View style={styles.field}>
                <Text style={[textStyles.body, { color: t.muted }]}>First name</Text>
                <TextInput
                  accessibilityLabel="First name"
                  autoFocus
                  value={draft.values.firstName}
                  onChangeText={(value) => draft.setValue('firstName', value)}
                  editable={!draft.saving}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="given-name"
                  returnKeyType="next"
                  onSubmitEditing={() => lastNameRef.current?.focus()}
                  style={inputStyle}
                />
              </View>
              <View style={styles.field}>
                <Text style={[textStyles.body, { color: t.muted }]}>Last name</Text>
                <TextInput
                  ref={lastNameRef}
                  accessibilityLabel="Last name"
                  value={draft.values.lastName}
                  onChangeText={(value) => draft.setValue('lastName', value)}
                  editable={!draft.saving}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="family-name"
                  returnKeyType="done"
                  onSubmitEditing={() => { void draft.submit(); }}
                  style={inputStyle}
                />
              </View>
            </> : null}
            {field === 'postal' ? <>
              <View style={styles.field}>
                <Text style={[textStyles.body, { color: t.muted }]}>First two postal digits</Text>
                <TextInput
                  accessibilityLabel="First two postal digits"
                  autoFocus
                  value={draft.values.postalSector}
                  onChangeText={(value) => draft.setValue('postalSector', value)}
                  editable={!draft.saving}
                  inputMode="numeric"
                  maxLength={2}
                  returnKeyType="done"
                  onSubmitEditing={() => { void draft.submit(); }}
                  style={inputStyle}
                />
              </View>
              <Text accessibilityLiveRegion="polite" style={[textStyles.body, { color: t.muted }]}>{draft.postalHint}</Text>
            </> : null}
            {field === 'services' ? <>
              <Text style={[textStyles.body, { color: t.muted }]}>Choose the services you attend.</Text>
              {services.map((service) => {
                const selected = draft.values.serviceIds.includes(service._id);
                return <Pressable
                  key={service._id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={service.name}
                  accessibilityState={{ checked: selected, disabled: draft.saving }}
                  aria-checked={selected}
                  aria-disabled={draft.saving}
                  disabled={draft.saving}
                  onPress={() => draft.toggleService(service._id)}
                  style={({ pressed }) => [styles.service, { backgroundColor: pressed ? t.soft : 'transparent' }]}
                >
                  <View style={[styles.check, { backgroundColor: selected ? t.accent : t.soft }]}>
                    <Text accessible={false} style={[textStyles.button, { color: t.accentInk }]}>{selected ? '✓' : ''}</Text>
                  </View>
                  <Text style={[textStyles.body, styles.serviceLabel, { color: t.text }]}>{service.name}</Text>
                </Pressable>;
              })}
              {draft.values.serviceIds.length === 0 ? <Text style={[textStyles.body, { color: t.muted }]}>Choose at least one service.</Text> : null}
            </> : null}
            {draft.error ? <Text accessibilityRole="alert" style={[textStyles.body, { color: t.danger }]}>{draft.error}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable disabled={draft.saving} aria-disabled={draft.saving} accessibilityRole="button" onPress={draft.close} style={styles.action}>
              <Text style={[textStyles.button, { color: draft.saving ? t.muted : t.text }]}>Cancel</Text>
            </Pressable>
            <Pressable disabled={!draft.canSave} aria-disabled={!draft.canSave} accessibilityRole="button" onPress={() => { void draft.submit(); }} style={styles.action}>
              <Text style={[textStyles.button, { color: draft.canSave ? t.text : t.muted }]}>{draft.saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: spacing.xl },
  dialog: { width: '100%', maxWidth: 380, maxHeight: '85%', borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  scroll: { flexShrink: 1 },
  fields: { gap: spacing.lg },
  field: { gap: spacing.sm },
  input: { ...textStyles.body, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 44 },
  service: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, paddingVertical: spacing.sm, borderRadius: radius.sm },
  serviceLabel: { flex: 1 },
  check: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  action: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
});

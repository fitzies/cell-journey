import { useConvexAuth, useMutation } from 'convex/react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGroups } from '@/components/group-context';
import { ActionButton } from '@/components/leader/ui';
import { ModalFormHeader } from '@/components/modal-form-header';
import { LoadingState } from '@/components/onboarding/ui';
import { emptyPersonalDetails, PersonalDetailsFields, personalDetailsPayload } from '@/components/personal-details-fields';
import { radius, spacing, textStyles, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

function closeForm() {
  if (router.canDismiss()) router.dismiss();
  else router.replace('/(leader-tabs)/members');
}

const emptyForm = { firstName: '', lastName: '', email: '' };

export default function AddMemberScreen() {
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  // Use the route's group, never the currently selected one.
  const groupId = typeof params.groupId === 'string' ? params.groupId : undefined;
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { context, ledGroups } = useGroups();
  const group = ledGroups.find((candidate) => candidate._id === groupId);
  const canAdd = group?.capabilities.manageMembers === true;
  const addMember = useMutation(api.groups.addMemberByEmail);
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [form, setForm] = useState(emptyForm);
  const [details, setDetails] = useState(emptyPersonalDetails);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ name: string; email: string; status: 'invited' | 'addedExisting' } | null>(null);
  const savingRef = useRef(false);
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  const email = form.email.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const detailsPayload = personalDetailsPayload(details);
  const ready = canAdd && Boolean(form.firstName.trim() && form.lastName.trim()) && emailValid && detailsPayload.ok;

  const set = (key: keyof typeof emptyForm, value: string) => {
    setError(null);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const close = () => {
    if (savingRef.current) return;
    Keyboard.dismiss();
    closeForm();
  };
  const submit = async () => {
    if (savingRef.current || !ready || !group || !detailsPayload.ok) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const { dateOfBirth, sex, phone } = detailsPayload.value;
      const result = await addMember({
        groupId: group._id,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email,
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(sex ? { sex } : {}),
        ...(phone ? { phone } : {}),
      });
      Keyboard.dismiss();
      setAdded({ name: `${form.firstName.trim()} ${form.lastName.trim()}`, email, status: result.status });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : 'Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const addAnother = () => {
    setForm(emptyForm);
    setDetails(emptyPersonalDetails);
    setAdded(null);
  };

  if (!isLoading && !isAuthenticated) return <Redirect href="/" />;
  const inputStyle = [styles.input, { backgroundColor: t.surface, borderColor: t.line, color: t.ink }];

  return <>
    <ModalFormHeader title={added ? 'Member added' : 'Add member'} onClose={close} closeDisabled={saving}
      onDone={added ? close : () => { void submit(); }} doneLabel={added ? 'Done' : saving ? 'Adding…' : 'Add member'}
      doneDisabled={added ? false : !ready || saving} />
    {isLoading || context === undefined ? <LoadingState /> : !group || !canAdd ? <View style={styles.message}>
      <Text style={[textStyles.title, { color: t.ink }]}>Can’t add members</Text>
      <Text style={[textStyles.body, { color: t.muted }]}>Only the group’s leader can add members. Your access may have changed.</Text>
    </View> : added ? <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
      <View accessibilityLiveRegion="polite" style={[styles.success, { backgroundColor: t.selected, borderColor: t.accent }]}>
        <Text style={[textStyles.section, { color: t.ink }]}>{added.name} is now in {group.name}</Text>
        <Text style={[textStyles.body, { color: t.muted }]}>
          {added.status === 'invited'
            ? `We’ve emailed ${added.email}. They can download Cell Journey and sign in with that email to see the group.`
            : `They already have a Cell Journey account, so ${group.name} now shows in their groups. We’ve emailed ${added.email} to let them know.`}
        </Text>
      </View>
      <View style={styles.actions}>
        <ActionButton label="Add another" onPress={addAnother} />
        <ActionButton label="Done" filled onPress={close} />
      </View>
    </ScrollView> : <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
        <Text style={[textStyles.body, { color: t.muted }]}>
          They join {group.name} straight away and get an email. New people sign in with this email to claim their profile.
        </Text>
        <View style={styles.section}>
          <View style={styles.field}>
            <Text style={[textStyles.body, { color: t.muted }]}>First name</Text>
            <TextInput accessibilityLabel="First name" autoFocus value={form.firstName} onChangeText={(value) => set('firstName', value)}
              editable={!saving} autoCapitalize="words" autoComplete="off" autoCorrect={false} returnKeyType="next" submitBehavior="submit"
              onSubmitEditing={() => lastNameRef.current?.focus()} style={inputStyle} />
          </View>
          <View style={styles.field}>
            <Text style={[textStyles.body, { color: t.muted }]}>Last name</Text>
            <TextInput ref={lastNameRef} accessibilityLabel="Last name" value={form.lastName} onChangeText={(value) => set('lastName', value)}
              editable={!saving} autoCapitalize="words" autoComplete="off" autoCorrect={false} returnKeyType="next" submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()} style={inputStyle} />
          </View>
          <View style={styles.field}>
            <Text style={[textStyles.body, { color: t.muted }]}>Email</Text>
            <TextInput ref={emailRef} accessibilityLabel="Email" value={form.email} onChangeText={(value) => set('email', value)}
              editable={!saving} autoCapitalize="none" autoComplete="off" autoCorrect={false} keyboardType="email-address" inputMode="email"
              returnKeyType="done" placeholder="name@example.com" placeholderTextColor={t.muted} style={inputStyle} />
          </View>
        </View>
        <View style={styles.section}>
          <Text style={[textStyles.section, { color: t.ink }]}>Optional details</Text>
          <PersonalDetailsFields values={details} onChange={(next) => { setError(null); setDetails(next); }} disabled={saving} />
        </View>
        {error ? <Text accessibilityRole="alert" style={[textStyles.body, { color: t.danger }]}>{error}</Text> : null}
        {saving ? <View accessibilityRole="progressbar" accessibilityLabel="Adding member" style={styles.saving}>
          <ActivityIndicator color={t.ink} />
          <Text style={[textStyles.body, { color: t.muted }]}>Adding member…</Text>
        </View> : null}
      </ScrollView>
    </KeyboardAvoidingView>}
  </>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: spacing.xl },
  section: { gap: spacing.lg },
  field: { gap: spacing.sm },
  input: { ...textStyles.body, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 48 },
  message: { padding: 24, gap: 12 },
  success: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  actions: { gap: spacing.md },
  saving: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

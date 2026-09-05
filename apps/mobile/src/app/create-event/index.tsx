import { useConvexAuth, useMutation } from 'convex/react';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight, usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Button, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultEventForm, EventFormFields, parseEventForm } from '@/components/events/event-form';
import { useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { textStyles, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';
import { startOfToday } from '@/lib/date';

function dismissForm() {
  if (router.canDismiss()) router.dismiss();
  else router.replace('/(leader-tabs)/attendance');
}

export default function CreateEventScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string | string[] }>();
  // Resolve only the route's group, never the currently selected group.
  const targetGroupId = typeof groupId === 'string' ? groupId : undefined;
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { context, ledGroups } = useGroups();
  const group = ledGroups.find((candidate) => candidate._id === targetGroupId);
  const canCreate = isAuthenticated && group?.capabilities.createEvents === true;
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [form, setForm] = useState(defaultEventForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
  const createEvent = useMutation(api.events.createForGroup);

  // Covers hardware/system back and removal of the parent modal while a write is pending.
  usePreventRemove(saving, () => {});
  useEffect(() => {
    if (saved && !saving) dismissForm();
  }, [saved, saving]);

  const close = () => { if (!savingRef.current) dismissForm(); };
  const submit = async () => {
    if (savingRef.current || saved) return;
    if (!canCreate || !group) {
      Alert.alert('Access changed', 'You no longer have permission to create events for this group.');
      return;
    }
    const parsed = parseEventForm(form, startOfToday());
    if (!parsed.ok) {
      Alert.alert('Check event details', parsed.message);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await createEvent({ groupId: group._id, ...parsed.value });
      setSaved(true);
    } catch (error) {
      Alert.alert('Could not create event', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!isLoading && !isAuthenticated) return <Redirect href="/" />;

  return <>
    {Platform.OS === 'web' ? <Stack.Screen options={{
      headerLeft: () => <Button title="Back" color={t.ink} disabled={saving} onPress={close} />,
      headerRight: () => <Button title={saving ? 'Saving…' : 'Done'} color={t.ink} disabled={!canCreate || saving || saved} onPress={submit} />,
    }} /> : <>
      <Stack.Toolbar placement="left" tintColor={t.ink}>
        <Stack.Toolbar.Button accessibilityLabel="Back" icon={Platform.OS === 'ios' ? 'chevron.left' : undefined} disabled={saving} separateBackground onPress={close}>{Platform.OS === 'android' ? 'Back' : null}</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right" tintColor={t.ink}>
        <Stack.Toolbar.Button accessibilityLabel={saving ? 'Saving event' : 'Done, create event'} icon={Platform.OS === 'ios' ? 'checkmark' : undefined} disabled={!canCreate || saving || saved} separateBackground onPress={submit}>{Platform.OS === 'android' ? 'Done' : null}</Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>}
    {isLoading || context === undefined ? <LoadingState /> : !canCreate || !group ? (
      <View style={styles.unavailable}>
        <Text style={[textStyles.title, { color: t.ink }]}>Event creation unavailable</Text>
        <Text style={[textStyles.body, { color: t.muted }]}>Return to Events and select a group you can create events for.</Text>
      </View>
    ) : (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
          <Text style={[textStyles.body, { color: t.muted }]}>{group.name}</Text>
          <EventFormFields form={form} saving={saving || saved} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
          <Text style={[styles.helper, { color: t.muted }]}>Title, date, and times are required. Everything else is optional.</Text>
          {saving ? <View accessibilityRole="progressbar" accessibilityLabel="Saving event" style={styles.saving}>
            <ActivityIndicator color={t.ink} />
            <Text style={[textStyles.body, { color: t.muted }]}>Saving event…</Text>
          </View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    )}
  </>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, gap: 24 },
  helper: { ...textStyles.body, fontSize: 13, lineHeight: 18 },
  unavailable: { padding: 24, gap: 12 },
  saving: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

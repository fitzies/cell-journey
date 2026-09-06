import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight, usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Button, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventCanvas } from '@/components/events/event-canvas';
import { defaultEventForm, eventToForm, parseEventForm } from '@/components/events/event-form';
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
  const { groupId, eventId } = useLocalSearchParams<{ groupId?: string | string[]; eventId?: string | string[] }>();
  const editing = eventId !== undefined;
  const targetEventId = typeof eventId === 'string' ? eventId : '';
  // Resolve only the route's group, never the currently selected group.
  const targetGroupId = typeof groupId === 'string' ? groupId : undefined;
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { context, ledGroups } = useGroups();
  const group = ledGroups.find((candidate) => candidate._id === targetGroupId);
  const event = useQuery(api.events.getForEditing, editing && isAuthenticated ? { eventId: targetEventId } : 'skip');
  const canSave = isAuthenticated && (editing
    ? group?.capabilities.updateEvents === true && !!event && event.groupId === group._id
    : group?.capabilities.createEvents === true);
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [form, setForm] = useState(defaultEventForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
  const createEvent = useMutation(api.events.createForGroup);
  const updateEvent = useMutation(api.events.update);
  const [loadedEventId, setLoadedEventId] = useState<string | null>(null);
  // Initialize each event once so subscription updates cannot overwrite a draft.
  if (event && event._id !== loadedEventId) {
    setForm(eventToForm(event));
    setLoadedEventId(event._id);
  }
  const ready = canSave && (!editing || loadedEventId === targetEventId);
  const earliestStartAt = editing ? Number.NEGATIVE_INFINITY : startOfToday();

  // Covers hardware/system back and removal of the parent modal while a write is pending.
  usePreventRemove(saving, () => {});
  useEffect(() => {
    if (saved && !saving) dismissForm();
  }, [saved, saving]);

  const close = () => { if (!savingRef.current) dismissForm(); };
  const submit = async () => {
    if (savingRef.current || saved) return;
    if (!ready || !group) {
      Alert.alert('Access changed', 'You no longer have permission to save this event.');
      return;
    }
    const parsed = parseEventForm(form, earliestStartAt);
    if (!parsed.ok) {
      Alert.alert('Check event details', parsed.message);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (editing && event) await updateEvent({ eventId: event._id, ...parsed.value });
      else await createEvent({ groupId: group._id, ...parsed.value });
      setSaved(true);
    } catch (error) {
      Alert.alert(editing ? 'Could not save event' : 'Could not create event', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!isLoading && !isAuthenticated) return <Redirect href="/" />;

  return <>
    <Stack.Screen options={{ title: editing ? 'Edit event' : 'New event', ...(Platform.OS === 'web' ? {
      headerLeft: () => <Button title="×" accessibilityLabel="Close" color={t.ink} disabled={saving} onPress={close} />,
      headerRight: () => <Button title={saving ? 'Saving…' : 'Done'} color={t.ink} disabled={!ready || saving || saved} onPress={submit} />,
    } : {}) }} />
    {Platform.OS !== 'web' ? <>
      <Stack.Toolbar placement="left" tintColor={t.ink}>
        <Stack.Toolbar.Button accessibilityLabel="Close" icon={Platform.OS === 'ios' ? 'xmark' : require('@/assets/images/toolbar/close.png')} iconRenderingMode="template" disabled={saving} separateBackground onPress={close} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right" tintColor={t.ink}>
        <Stack.Toolbar.Button accessibilityLabel={saving ? 'Saving event' : editing ? 'Done, save event' : 'Done, create event'} icon={Platform.OS === 'ios' ? 'checkmark' : undefined} disabled={!ready || saving || saved} separateBackground onPress={submit}>{Platform.OS === 'android' ? 'Done' : null}</Stack.Toolbar.Button>
      </Stack.Toolbar>
    </> : null}
    {isLoading || context === undefined || (editing && (event === undefined || (event && loadedEventId !== event._id))) ? <LoadingState /> : !ready || !group ? (
      <View style={styles.unavailable}>
        <Text style={[textStyles.title, { color: t.ink }]}>Event unavailable</Text>
        <Text style={[textStyles.body, { color: t.muted }]}>This event may have been deleted, or your access may have changed. Return to Events to continue.</Text>
      </View>
    ) : (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
          <EventCanvas earliestStartAt={earliestStartAt} groupName={group.name} form={form} saving={saving || saved} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
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
  unavailable: { padding: 24, gap: 12 },
  saving: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

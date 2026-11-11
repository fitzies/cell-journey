import {
  GROUP_LOCATION_MAX_LENGTH,
  groupDemographicLabels,
  groupDemographicOptions,
  groupFrequencyLabels,
  groupFrequencyOptions,
  groupLanguageLabels,
  groupLanguageOptions,
  type GroupDemographic,
  type GroupFrequency,
  type GroupLanguage,
} from '@cell-journey/domain';
import { useConvexAuth, useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGroups } from '@/components/group-context';
import { ModalFormHeader } from '@/components/modal-form-header';
import { LoadingState } from '@/components/onboarding/ui';
import { radius, spacing, textStyles, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';
import { groupDetailsSummary } from '@/lib/group-details';

function closeScreen() {
  if (router.canDismiss()) router.dismiss();
  else router.replace('/(leader-tabs)/profile');
}

type Draft = {
  languages: GroupLanguage[];
  frequency: GroupFrequency | null;
  demographic: GroupDemographic | null;
  location: string;
};

function OptionChip({ label, selected, disabled, onPress, role }: { label: string; selected: boolean; disabled: boolean; onPress: () => void; role: 'checkbox' | 'radio' }) {
  const t = useAppTheme();
  return <Pressable accessibilityRole={role} accessibilityState={{ checked: selected, disabled }} aria-checked={selected} disabled={disabled}
    onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
    style={({ pressed }) => [styles.chip, {
      backgroundColor: selected ? t.selected : t.surface,
      borderColor: selected ? t.accent : t.line,
      opacity: pressed ? 0.8 : 1,
    }]}>
    <Text style={[textStyles.button, { color: selected ? t.accent : t.ink }]}>{selected && role === 'checkbox' ? `✓ ${label}` : label}</Text>
  </Pressable>;
}

export default function GroupDetailsScreen() {
  const params = useLocalSearchParams<{ groupId?: string | string[] }>();
  const groupId = typeof params.groupId === 'string' ? params.groupId : undefined;
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { context, ledGroups } = useGroups();
  const group = ledGroups.find((candidate) => candidate._id === groupId);
  // Group details belong to the group's leader; co-leaders see them read-only.
  const canEdit = group?.accessRole === 'owner';
  const update = useMutation(api.groups.updateGroupDetails);
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  // Initialise once so live updates can't overwrite an edit in progress.
  if (group && !draft) {
    setDraft({
      languages: group.languages ?? [],
      frequency: group.frequency ?? null,
      demographic: group.demographic ?? null,
      location: group.location ?? '',
    });
  }

  const change = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((current) => current ? { ...current, ...patch } : current);
  };
  const close = () => {
    if (savingRef.current) return;
    Keyboard.dismiss();
    closeScreen();
  };
  const save = async () => {
    if (savingRef.current || !group || !draft || !canEdit) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await update({
        groupId: group._id,
        languages: draft.languages,
        frequency: draft.frequency,
        demographic: draft.demographic,
        location: draft.location.trim() || null,
      });
      Keyboard.dismiss();
      savingRef.current = false;
      setSaving(false);
      closeScreen();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : 'Please try again.');
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!isLoading && !isAuthenticated) return <Redirect href="/" />;
  const disabled = saving || !canEdit;

  return <>
    <ModalFormHeader title="Group details" onClose={close} closeDisabled={saving}
      onDone={canEdit ? () => { void save(); } : undefined} doneLabel={saving ? 'Saving…' : 'Save group details'} doneDisabled={saving || !draft} />
    {isLoading || context === undefined ? <LoadingState /> : !group || !draft ? <View style={styles.message}>
      <Text style={[textStyles.title, { color: t.ink }]}>Group unavailable</Text>
      <Text style={[textStyles.body, { color: t.muted }]}>Your leadership access to this group may have changed.</Text>
    </View> : <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
        <View style={styles.intro}>
          <Text style={[textStyles.title, { color: t.ink }]}>{group.name}</Text>
          <Text style={[textStyles.body, { color: t.muted }]}>
            {canEdit ? 'Describe how your group meets. Admins and regional leaders see this on the dashboard.' : groupDetailsSummary(group)}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[textStyles.section, { color: t.ink }]}>Language</Text>
          <Text style={[textStyles.body, { color: t.muted }]}>Choose every language the group uses.</Text>
          <View style={styles.chips}>
            {groupLanguageOptions.map((language) => {
              const selected = draft.languages.includes(language);
              return <OptionChip key={language} role="checkbox" label={groupLanguageLabels[language]} selected={selected} disabled={disabled}
                onPress={() => change({ languages: selected ? draft.languages.filter((value) => value !== language) : [...draft.languages, language] })} />;
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[textStyles.section, { color: t.ink }]}>How often you meet</Text>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {groupFrequencyOptions.map((frequency) => <OptionChip key={frequency} role="radio" label={groupFrequencyLabels[frequency]}
              selected={draft.frequency === frequency} disabled={disabled}
              onPress={() => change({ frequency: draft.frequency === frequency ? null : frequency })} />)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[textStyles.section, { color: t.ink }]}>Who it’s for</Text>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {groupDemographicOptions.map((demographic) => <OptionChip key={demographic} role="radio" label={groupDemographicLabels[demographic]}
              selected={draft.demographic === demographic} disabled={disabled}
              onPress={() => change({ demographic: draft.demographic === demographic ? null : demographic })} />)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[textStyles.section, { color: t.ink }]}>Location</Text>
          <Text style={[textStyles.body, { color: t.muted }]}>Where the group usually meets, in your own words.</Text>
          <TextInput accessibilityLabel="Location" value={draft.location} onChangeText={(location) => change({ location })}
            editable={!disabled} maxLength={GROUP_LOCATION_MAX_LENGTH} placeholder="e.g. Bishan, near the MRT" placeholderTextColor={t.muted}
            returnKeyType="done" style={[styles.input, { backgroundColor: t.surface, borderColor: t.line, color: t.ink }]} />
        </View>

        {error ? <Text accessibilityRole="alert" style={[textStyles.body, { color: t.danger }]}>{error}</Text> : null}
        {saving ? <View accessibilityRole="progressbar" accessibilityLabel="Saving group details" style={styles.saving}>
          <ActivityIndicator color={t.ink} />
          <Text style={[textStyles.body, { color: t.muted }]}>Saving…</Text>
        </View> : null}
      </ScrollView>
    </KeyboardAvoidingView>}
  </>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: spacing.xl },
  intro: { gap: spacing.xs },
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: { minHeight: 40, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  input: { ...textStyles.body, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 48, marginTop: spacing.xs },
  message: { padding: 24, gap: 12 },
  saving: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

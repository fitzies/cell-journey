import { SymbolView } from 'expo-symbols';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppMode } from '@/components/app-header';
import { radius, spacing, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import type { Id } from '@/lib/api';

export function ProfileGroupsSheet({ mode, entries, selectedId, busy, onClose, onSelect, onLeave }: {
  mode: AppMode;
  entries: { id: Id<'groups'>; name: string; role: string }[];
  selectedId: Id<'groups'> | null;
  busy: boolean;
  onClose: () => void;
  onSelect: (id: Id<'groups'>) => void;
  onLeave?: () => void;
}) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const selectedName = entries.find((entry) => entry.id === selectedId)?.name;
  return <Modal visible transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose}>
    <View style={[styles.overlay, { paddingTop: Math.max(insets.top, spacing.lg) }]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close groups" disabled={busy} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, spacing.lg) }, surfaceShadow(t)]}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[textStyles.title, styles.flex, { color: t.text }]}>{mode === 'leader' ? 'Your leadership groups' : 'Your groups'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close groups" disabled={busy} onPress={onClose} style={[styles.close, { backgroundColor: t.soft, opacity: busy ? 0.5 : 1 }, surfaceShadow(t, 'button')]}>
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={19} tintColor={t.strong} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {entries.map((entry) => <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={`${entry.name}, ${entry.role}`}
            accessibilityState={{ selected: entry.id === selectedId, disabled: busy }}
            aria-selected={entry.id === selectedId}
            aria-disabled={busy}
            disabled={busy}
            onPress={() => onSelect(entry.id)}
            style={({ pressed }) => [styles.row, surfaceShadow(t), { backgroundColor: entry.id === selectedId ? t.selected : t.background, opacity: busy ? 0.5 : pressed ? 0.75 : 1 }]}
          >
            <View style={styles.flex}>
              <Text style={[textStyles.button, { color: t.text }]}>{entry.name}</Text>
              <Text style={[textStyles.body, { color: t.muted, marginTop: spacing.sm }]}>{entry.id === selectedId ? 'Selected · ' : ''}{entry.role}</Text>
            </View>
            {entry.id === selectedId ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={18} tintColor={t.strong} /> : null}
          </Pressable>)}
          {!entries.length ? <Text style={[textStyles.body, { color: t.muted }]}>{mode === 'leader' ? 'No leadership groups assigned.' : 'No active memberships. Join a group to get started.'}</Text> : null}
          {mode === 'leader' ? <Text style={[textStyles.body, styles.hint, { color: t.muted }]}>Group leadership is assigned by the app owner.</Text> : onLeave ? <>
            <Text style={[textStyles.body, styles.hint, { color: t.muted }]}>Leaving applies to {selectedName} only.</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onLeave} style={styles.leave}>
              <Text style={[textStyles.button, { color: t.danger, opacity: busy ? 0.5 : 1 }]}>{busy ? 'Leaving…' : 'Leave selected group'}</Text>
            </Pressable>
          </> : null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 20, paddingTop: spacing.lg },
  header: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.lg },
  close: { width: 44, height: 44, borderRadius: radius.pill, justifyContent: 'center', alignItems: 'center' },
  flex: { flex: 1, minWidth: 0 },
  body: { gap: spacing.md, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.md, padding: spacing.lg, minHeight: 64 },
  hint: { marginTop: spacing.sm },
  leave: { minHeight: 44, justifyContent: 'center', alignItems: 'center', padding: spacing.md },
});

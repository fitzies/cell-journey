import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import type { MemberStatus } from './types';

export function MembersToolbar({ groupName, status, activeCount, inactiveCount, search, disabled, busy, offline = false, dragging, error, onDismissError, onSearch, onStatus }: {
  groupName: string; status: MemberStatus; activeCount: number; inactiveCount: number;
  search: string; disabled: boolean; busy: boolean; offline?: boolean; dragging: boolean; error: string | null;
  onDismissError: () => void; onSearch: (value: string) => void; onStatus: (status: MemberStatus) => void;
}) {
  const t = useAppTheme();
  return <View style={styles.header}>
    <Text style={[textStyles.body, { color: t.muted }]}>{groupName}</Text>
    <TextInput
      accessibilityLabel="Search members"
      placeholder="Search members"
      placeholderTextColor={t.muted}
      value={search}
      onChangeText={onSearch}
      editable={!disabled}
      autoCorrect={false}
      returnKeyType="search"
      clearButtonMode="while-editing"
      style={[styles.search, textStyles.body, { backgroundColor: t.soft, color: t.text }]}
    />
    <View style={[styles.segments, { backgroundColor: t.soft }]}>
      {(['active', 'inactive'] as const).map((value) => <Pressable
        key={value}
        accessibilityRole="tab"
        accessibilityState={{ selected: status === value, disabled }}
        disabled={disabled}
        onPress={() => onStatus(value)}
        style={[styles.segment, status === value && [surfaceShadow(t), { backgroundColor: t.surface }]]}
      ><Text style={[styles.segmentText, { color: status === value ? t.text : t.muted }]}>{value === 'active' ? 'Active' : 'Inactive'} <Text style={styles.count}>{value === 'active' ? activeCount : inactiveCount}</Text></Text></Pressable>)}
    </View>
    <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: t.muted }]}>{offline ? 'Reconnect to make changes' : busy ? 'Saving…' : dragging ? 'Release to place' : search.trim() ? 'Clear search to rearrange' : 'Hold an avatar to rearrange'}</Text>
    {error ? <View accessibilityRole="alert" style={styles.error}>
      <Text style={[textStyles.body, { color: t.danger, flex: 1 }]}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={onDismissError} style={styles.dismiss}><Text style={[textStyles.button, { color: t.text }]}>Dismiss</Text></Pressable>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  header: { gap: 14, marginBottom: 8 },
  search: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md },
  segments: { flexDirection: 'row', padding: 4, borderRadius: radius.md, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 8 },
  segmentText: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 18 },
  count: { fontFamily: fonts.body, fontVariant: ['tabular-nums'] },
  hint: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, textAlign: 'right' },
  error: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dismiss: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
});

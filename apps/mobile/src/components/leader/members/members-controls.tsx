import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fonts, radius, textStyles, useAppTheme } from '@/constants/tokens';
import type { MemberSort } from './types';

export function MembersToolbar({ groupName, sort, visibleCount, totalCount, search, disabled, busy, offline = false, dragging, error, onDismissError, onSearch }: {
  groupName: string; sort: MemberSort; visibleCount: number; totalCount: number;
  search: string; disabled: boolean; busy: boolean; offline?: boolean; dragging: boolean; error: string | null;
  onDismissError: () => void; onSearch: (value: string) => void;
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
    <Text accessibilityLiveRegion="polite" style={[textStyles.body, { color: t.muted }]}>
      All members · {search.trim() ? `${visibleCount} of ${totalCount}` : totalCount}{sort === 'name' ? ' · Name A–Z' : ''}
    </Text>
    <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: t.muted }]}>{offline ? 'Reconnect to make changes' : busy ? 'Saving…' : dragging ? 'Release to place' : search.trim() ? 'Clear search to rearrange' : sort === 'name' ? 'Choose Saved order to rearrange' : visibleCount > 1 ? 'Hold an avatar to rearrange' : 'Tap a name for member actions'}</Text>
    {error ? <View accessibilityRole="alert" style={styles.error}>
      <Text style={[textStyles.body, { color: t.danger, flex: 1 }]}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={onDismissError} style={styles.dismiss}><Text style={[textStyles.button, { color: t.text }]}>Dismiss</Text></Pressable>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  header: { gap: 14, marginBottom: 8 },
  search: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md },
  hint: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, textAlign: 'right' },
  error: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dismiss: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
});

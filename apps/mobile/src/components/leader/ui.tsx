import { type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader, type AppHeaderProps } from '@/components/app-header';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';

export function LeaderScreen({ title, profile, headerShown = true, eventActions, contentStyle, children }: PropsWithChildren<{ title: string; profile?: boolean; headerShown?: boolean; eventActions?: AppHeaderProps['eventActions']; contentStyle?: StyleProp<ViewStyle> }>) {
  const t = useAppTheme();
  return (
    <SafeAreaView edges={headerShown ? [] : ['top']} style={[styles.root, { backgroundColor: t.background }]}>
      {headerShown ? <AppHeader title={title} mode="leader" profile={profile} eventActions={eventActions} /> : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, contentStyle]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  const t = useAppTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: t.ink }]}>{title}</Text>
      {meta ? <Text style={[styles.sectionMeta, { color: t.muted }]}>{meta}</Text> : null}
    </View>
  );
}

export function Card({ children, accent }: PropsWithChildren<{ accent?: boolean }>) {
  const t = useAppTheme();
  return <View style={[styles.card, surfaceShadow(t), { backgroundColor: accent ? t.accent : t.surface }]}>{children}</View>;
}

export function Mark({ children, success, danger, compact }: PropsWithChildren<{ success?: boolean; danger?: boolean; compact?: boolean }>) {
  const t = useAppTheme();
  return (
    <View style={[styles.mark, compact && styles.compactMark, { backgroundColor: success ? t.success : danger ? t.danger : t.soft }]}>
      <Text style={[styles.markText, compact && styles.compactMarkText, { color: success || danger ? t.accentInk : t.accent }]}>{children}</Text>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const t = useAppTheme();
  return (
    <Card>
      <Mark>○</Mark>
      <Text style={[styles.emptyTitle, { color: t.ink }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: t.muted }]}>{body}</Text>
    </Card>
  );
}

export function ActionButton({ label, onPress, danger, disabled, filled }: { label: string; onPress?: () => void; danger?: boolean; disabled?: boolean; filled?: boolean }) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        surfaceShadow(t, filled ? 'buttonFilled' : 'button'),
        {
          backgroundColor: filled ? t.accent : t.surface,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
        },
      ]}
    >
      <Text style={[styles.buttonText, { color: filled ? t.accentInk : danger ? t.danger : t.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function StatPill({ label, value }: { label: string; value: string | number }) {
  const t = useAppTheme();
  return (
    <View style={[styles.statPill, surfaceShadow(t), { backgroundColor: t.surface }]}>
      <Text style={[styles.statValue, { color: t.ink }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.muted }]}>{label}</Text>
    </View>
  );
}

export function RowCard({ mark, title, detail, right, compact, children }: PropsWithChildren<{ mark: ReactNode; title: string; detail?: string; right?: ReactNode; compact?: boolean }>) {
  const t = useAppTheme();
  return (
    <View style={[styles.rowCard, surfaceShadow(t), compact && styles.compactRowCard, { backgroundColor: t.surface }]}>
      {mark}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, { color: t.ink }]}>{title}</Text>
        {detail ? <Text style={[styles.rowDetail, { color: t.muted }]} numberOfLines={2}>{detail}</Text> : null}
        {children}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 108 },
  sectionRow: { marginTop: 28, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...textStyles.section },
  sectionMeta: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  card: { borderRadius: radius.lg, borderCurve: 'continuous', padding: 18 },
  mark: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: fonts.bodyBold },
  compactMark: { width: 30, height: 30, borderRadius: 10 },
  compactMarkText: { fontSize: 13 },
  emptyTitle: { ...textStyles.section, marginTop: 16 },
  emptyBody: { ...textStyles.body, marginTop: 7 },
  button: { minHeight: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { ...textStyles.button, textAlign: 'center' },
  statPill: { flex: 1, borderRadius: radius.md, borderCurve: 'continuous', padding: 16 },
  statValue: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -1 },
  statLabel: { marginTop: 4, fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  rowCard: { borderRadius: radius.md, borderCurve: 'continuous', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  compactRowCard: { minHeight: 56, borderRadius: 16, paddingVertical: 5, paddingLeft: 10, paddingRight: 4, gap: 10 },
  rowTitle: { ...textStyles.body, fontFamily: fonts.bodySemiBold, letterSpacing: -0.3 },
  rowDetail: { ...textStyles.body, marginTop: 4 },
});

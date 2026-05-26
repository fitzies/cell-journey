import { type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, useAppTheme } from '@/constants/tokens';

export function LeaderScreen({ eyebrow, title, hint, children }: PropsWithChildren<{ eyebrow: string; title: string; hint?: string }>) {
  const t = useAppTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: t.accent }]}>{eyebrow}</Text>
          <Text style={[styles.title, { color: t.ink }]}>{title}</Text>
          {hint ? <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text> : null}
        </View>
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
  return <View style={[styles.card, { backgroundColor: accent ? t.accent : t.surface, borderColor: accent ? t.accent : t.line }]}>{children}</View>;
}

export function Mark({ children, success, danger }: PropsWithChildren<{ success?: boolean; danger?: boolean }>) {
  const t = useAppTheme();
  return (
    <View style={[styles.mark, { backgroundColor: success ? t.success : danger ? t.danger : t.soft }]}>
      <Text style={{ color: success || danger ? t.accentInk : t.accent, fontFamily: fonts.bodyBold }}>{children}</Text>
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
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: filled ? t.accent : t.surface,
          borderColor: filled ? t.accent : t.line,
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
    <View style={[styles.statPill, { backgroundColor: t.surface, borderColor: t.line }]}>
      <Text style={[styles.statValue, { color: t.ink }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.muted }]}>{label}</Text>
    </View>
  );
}

export function RowCard({ mark, title, detail, right, children }: PropsWithChildren<{ mark: ReactNode; title: string; detail?: string; right?: ReactNode }>) {
  const t = useAppTheme();
  return (
    <View style={[styles.rowCard, { backgroundColor: t.surface, borderColor: t.line }]}>
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
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 108 },
  header: { marginBottom: 24 },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 2.6, textTransform: 'uppercase' },
  title: { marginTop: 12, fontFamily: fonts.display, fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  hint: { marginTop: 10, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  sectionRow: { marginTop: 28, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 18, letterSpacing: -0.3 },
  sectionMeta: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 28, padding: 20, overflow: 'hidden' },
  mark: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 18, fontFamily: fonts.bodyBold, fontSize: 18, letterSpacing: -0.3 },
  emptyBody: { marginTop: 7, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  button: { minHeight: 46, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, letterSpacing: -0.15 },
  statPill: { flex: 1, borderWidth: 1, borderRadius: 22, padding: 16 },
  statValue: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -1 },
  statLabel: { marginTop: 4, fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  rowCard: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  rowTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.25 },
  rowDetail: { marginTop: 4, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },
});

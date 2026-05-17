import { useEffect, useRef, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { fonts, radius, typography, useAppTheme } from '@/constants/tokens';

let lastProgress = 0;

function usePageEntrance(animationKey?: string | number) {
  const opacity = useRef(new Animated.Value(0)).current;
  const shift = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    opacity.setValue(0);
    shift.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(shift, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [opacity, shift, animationKey]);
  return { opacity, transform: [{ translateY: shift }] };
}

export function useStaggerReveal(count: number, opts: { delay?: number; initialDelay?: number; duration?: number; animationKey?: string | number } = {}) {
  const { delay = 120, initialDelay = 80, duration = 440, animationKey } = opts;
  const valuesRef = useRef<Animated.Value[] | null>(null);
  if (!valuesRef.current) valuesRef.current = Array.from({ length: count }, () => new Animated.Value(0));
  const values = valuesRef.current;
  useEffect(() => {
    values.forEach((v) => v.setValue(0));
    Animated.parallel(values.map((v, i) => Animated.timing(v, { toValue: 1, duration, delay: initialDelay + i * delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }))).start();
  }, [animationKey, delay, duration, initialDelay, values]);
  const animStyle = (v: Animated.Value) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] });
  return { values, animStyle };
}

export function OnboardingShell({ children, eyebrow, title, hint, cta, onCta, ctaDisabled, onBack, pending = false, footer, progress = 0.55, animationKey, bottomContent }: PropsWithChildren<{ eyebrow?: string; title: string; hint?: string; cta?: string; onCta?: () => void; ctaDisabled?: boolean; onBack?: () => void; pending?: boolean; footer?: ReactNode; progress?: number; animationKey?: string | number; bottomContent?: ReactNode }>) {
  const t = useAppTheme();
  const bodyAnim = usePageEntrance(animationKey);
  const reveal = useStaggerReveal(4, { initialDelay: 70, animationKey });
  const progressAnim = useRef(new Animated.Value(lastProgress)).current;
  const pct = Math.max(0.06, Math.min(1, progress));
  useEffect(() => {
    Animated.timing(progressAnim, { toValue: pct, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    lastProgress = pct;
  }, [pct, progressAnim]);
  const width = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return <View style={[styles.root, { backgroundColor: t.background }]}> 
    {!pending && <SafeAreaView edges={['top']}><View style={styles.top}>{onBack ? <BackCircle onPress={onBack} /> : <View style={styles.spacer} />}<View style={[styles.rail, { backgroundColor: t.line }]}><Animated.View style={[styles.fill, { backgroundColor: t.accent, width }]} /></View><View style={styles.spacer} /></View></SafeAreaView>}
    <Animated.View style={[styles.animatedBody, bodyAnim]}>
      <ScrollView contentContainerStyle={[styles.body, pending && styles.pendingBody]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View><Animated.Text style={[styles.eyebrow, { color: t.accent }, reveal.animStyle(reveal.values[0])]}>{eyebrow}</Animated.Text><Animated.Text style={[styles.title, { color: t.ink }, reveal.animStyle(reveal.values[1])]}>{title}</Animated.Text>{hint ? <Animated.Text style={[styles.hint, { color: t.muted }, reveal.animStyle(reveal.values[2])]}>{hint}</Animated.Text> : null}</View>
        <Animated.View style={[styles.content, reveal.animStyle(reveal.values[3])]}>{children}</Animated.View>
      </ScrollView>
    </Animated.View>
    <SafeAreaView edges={['bottom']}><Animated.View style={[styles.footer, { opacity: bodyAnim.opacity }]}>{bottomContent ? <View style={styles.bottomContent}>{bottomContent}</View> : null}{footer ?? (cta ? <PrimaryButton label={cta} onPress={onCta} disabled={ctaDisabled} /> : null)}</Animated.View></SafeAreaView>
  </View>;
}

export function PrimaryButton({ label, onPress, disabled, ghost, arrow = true }: { label: string; onPress?: () => void; disabled?: boolean; ghost?: boolean; arrow?: boolean }) { const t = useAppTheme(); return <Pressable disabled={disabled} onPress={() => { if (disabled) return; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onPress?.(); }} style={({ pressed }) => [styles.button, ghost ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.line } : { backgroundColor: t.accent }, { opacity: disabled ? 0.42 : 1, transform: [{ scale: pressed && !disabled ? 0.985 : 1 }] }]}><View style={styles.buttonRow}><Text style={[styles.buttonText, { color: ghost ? t.ink : t.accentInk }]}>{label}</Text>{arrow ? <Text style={[styles.arrow, { color: ghost ? t.ink : t.accentInk }]}>→</Text> : null}</View></Pressable>; }
export function BackCircle({ onPress }: { onPress: () => void }) { const t = useAppTheme(); return <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} hitSlop={8} style={({ pressed }) => [styles.back, { backgroundColor: t.soft, transform: [{ scale: pressed ? 0.96 : 1 }] }]}><Text style={{ color: t.ink, fontSize: 24, marginTop: -2 }}>‹</Text></Pressable>; }
export function Field(props: TextInputProps) { const t = useAppTheme(); return <TextInput placeholderTextColor={t.muted} {...props} style={[styles.input, { backgroundColor: t.surface, color: t.ink, borderColor: t.line }, props.style]} />; }
export function CodeInput({ value, onChangeText, length = 6 }: { value: string; onChangeText: (value: string) => void; length?: number }) { const t = useAppTheme(); const clean = value.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, length); return <Pressable onPress={() => {}} style={styles.codeWrap}><TextInput value={clean} onChangeText={(v) => onChangeText(v.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, length))} autoCapitalize="characters" autoCorrect={false} keyboardType="default" maxLength={length} caretHidden style={styles.hiddenInput} autoFocus />{Array.from({ length }).map((_, i) => <View key={i} style={[styles.codeBox, { backgroundColor: t.surface, borderColor: clean[i] ? t.accent : t.line }]}><Text style={[styles.codeChar, { color: t.ink }]}>{clean[i] ?? ''}</Text></View>)}</Pressable>; }
export function OptionPill({ label, selected, onPress, mark = selected ? '✓' : '', sub }: { label: string; selected?: boolean; onPress: () => void; mark?: string; sub?: string }) { const t = useAppTheme(); return <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} style={({ pressed }) => [styles.pill, { backgroundColor: selected ? t.selected : t.surface, borderColor: selected ? t.accent : t.line, transform: [{ scale: pressed ? 0.99 : 1 }] }]}><View style={[styles.dot, { backgroundColor: selected ? t.accent : t.soft }]}><Text style={{ color: selected ? t.accentInk : t.accent, fontFamily: fonts.bodyBold, fontSize: 12 }}>{mark}</Text></View><View style={{ flex: 1 }}><Text style={[styles.pillText, { color: selected ? t.accent : t.ink }]}>{label}</Text>{sub ? <Text style={[styles.pillSub, { color: t.muted }]}>{sub}</Text> : null}</View></Pressable>; }
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) { const t = useAppTheme(); return <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} style={({ pressed }) => [styles.chip, { backgroundColor: selected ? t.selected : t.surface, borderColor: selected ? t.accent : t.line, transform: [{ scale: pressed ? 0.98 : 1 }] }]}><Text style={{ color: selected ? t.accent : t.ink, fontFamily: fonts.bodySemiBold }}>{label}</Text></Pressable>; }
export function Note({ badge, title, body }: { badge: string; title: string; body: string }) { const t = useAppTheme(); return <View style={[styles.note, { backgroundColor: t.soft, borderColor: t.line }]}><View style={[styles.avatar, { backgroundColor: t.accent }]}><Text style={{ color: t.accentInk, fontFamily: fonts.bodyBold }}>{badge}</Text></View><View style={{ flex: 1 }}><Text style={{ color: t.ink, fontFamily: fonts.bodyBold, fontSize: 16 }}>{title}</Text><Text style={[styles.noteBody, { color: t.muted }]}>{body}</Text></View></View>; }
export function BodyText({ children }: PropsWithChildren) { const t = useAppTheme(); return <Text style={[styles.hint, { color: t.muted }]}>{children}</Text>; }
export function LoadingState() { const t = useAppTheme(); return <OnboardingShell eyebrow="PLEASE WAIT" title="Preparing your profile."><ActivityIndicator color={t.ink} /></OnboardingShell>; }
export function StaggerItem({ index, children }: PropsWithChildren<{ index: number }>) { const { values, animStyle } = useStaggerReveal(index + 1); return <Animated.View style={animStyle(values[index])}>{children}</Animated.View>; }

const styles = StyleSheet.create({ root: { flex: 1 }, animatedBody: { flex: 1 }, top: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingTop: 14 }, spacer: { width: 40 }, rail: { flex: 1, height: 3, borderRadius: 999, overflow: 'hidden' }, fill: { height: '100%' }, body: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 18 }, pendingBody: { justifyContent: 'flex-start', paddingTop: 78 }, eyebrow: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 14, letterSpacing: 2.6, textTransform: 'uppercase' }, title: { marginTop: 12, fontFamily: fonts.display, fontSize: typography.display, lineHeight: 39, letterSpacing: -0.8 }, hint: { marginTop: 10, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, maxWidth: 320 }, content: { marginTop: 26, gap: 10 }, footer: { paddingHorizontal: 22, paddingBottom: 8, paddingTop: 14 }, bottomContent: { marginBottom: 12 }, button: { borderRadius: radius.pill, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 }, buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 17, letterSpacing: -0.2 }, arrow: { marginLeft: 10, fontSize: 18 }, back: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }, input: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: 16, minHeight: 60, fontFamily: fonts.display, fontSize: 23 }, codeWrap: { flexDirection: 'row', gap: 8, position: 'relative' }, hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 }, codeBox: { flex: 1, aspectRatio: 0.82, borderWidth: 1.5, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, codeChar: { fontFamily: fonts.mono, fontSize: 22, fontWeight: '700' }, pill: { minHeight: 64, borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, pillText: { fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.2 }, pillSub: { marginTop: 3, fontFamily: fonts.body, fontSize: 13 }, dot: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, chip: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5 }, note: { borderWidth: 1, borderRadius: radius.lg, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }, avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, noteBody: { marginTop: 3, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 } });

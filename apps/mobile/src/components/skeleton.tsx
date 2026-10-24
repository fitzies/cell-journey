import { useEffect, type PropsWithChildren } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { radius, surfaceShadow, useAppTheme } from '@/constants/tokens';

// One pulse drives the whole skeleton so every block fades together.
export function SkeletonPulse({ label, style, children }: PropsWithChildren<{ label: string; style?: StyleProp<ViewStyle> }>) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(0.5, { duration: 850, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={[style, animatedStyle]}
    >
      {children}
    </Animated.View>
  );
}

export function Bone({ width = '100%', height = 14, round = 7, style }: { width?: DimensionValue; height?: number; round?: number; style?: StyleProp<ViewStyle> }) {
  const t = useAppTheme();
  return <View style={[{ width, height, borderRadius: round, backgroundColor: t.track }, style]} />;
}

export function BoneCard({ style, children }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const t = useAppTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, ...surfaceShadow(t) }, style]}>{children}</View>;
}

// Placeholder for the date tile used on event cards.
export function DateBone({ large = false }: { large?: boolean }) {
  const t = useAppTheme();
  return <View style={[large ? styles.largeDate : styles.date, { backgroundColor: t.warmSoft }]} />;
}

export function BoneLines({ widths, gap = 9, lineHeight = 13 }: { widths: DimensionValue[]; gap?: number; lineHeight?: number }) {
  return (
    <View style={[styles.lines, { gap }]}>
      {widths.map((width, index) => <Bone key={index} width={width} height={index === 0 ? lineHeight + 2 : lineHeight} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderCurve: 'continuous' },
  date: { width: 54, height: 60, borderRadius: radius.sm },
  largeDate: { width: 68, height: 82, borderRadius: 19 },
  lines: { flex: 1, minWidth: 0 },
});

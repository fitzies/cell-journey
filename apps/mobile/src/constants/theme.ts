import '@/global.css';

import { Platform } from 'react-native';
import { fonts, palettes } from './tokens';

export const Colors = {
  light: {
    text: palettes.light.ink,
    background: palettes.light.background,
    backgroundElement: palettes.light.soft,
    backgroundSelected: palettes.light.selected,
    textSecondary: palettes.light.muted,
  },
  dark: {
    text: palettes.dark.ink,
    background: palettes.dark.background,
    backgroundElement: palettes.dark.soft,
    backgroundSelected: palettes.dark.selected,
    textSecondary: palettes.dark.muted,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: fonts.body,
    serif: fonts.display,
    rounded: fonts.body,
    mono: fonts.mono,
  },
  default: {
    sans: fonts.body,
    serif: fonts.display,
    rounded: fonts.body,
    mono: fonts.mono,
  },
  web: {
    sans: 'var(--font-sans)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-sans)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

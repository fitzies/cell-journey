import { mobileThemeFonts } from '@cell-journey/theme/mobile';
import { Platform, StyleSheet, useColorScheme, type ViewStyle } from 'react-native';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 12, md: 16, lg: 18, xl: 18, pill: 999 } as const;
export const typography = { display: 28, title: 22, h1: 22, h2: 19, body: 14.5, small: 12 } as const;

const platformSans = Platform.select({ ios: 'system-ui', android: 'sans-serif', default: 'system-ui' }) ?? 'system-ui';
const platformSerif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) ?? 'Georgia';
const platformMono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) ?? 'monospace';

function nativeFontAlias(family: string) {
  const normalized = family.toLowerCase();
  if (['system-ui', 'sans-serif', 'ui-sans-serif'].includes(normalized)) return platformSans;
  if (['georgia', 'times new roman', 'serif', 'ui-serif'].includes(normalized)) return platformSerif;
  if (['courier new', 'courier', 'menlo', 'monaco', 'monospace', 'ui-monospace'].includes(normalized)) return platformMono;
  return null;
}

function supportedNativeFamily(fontStack: string, fallback: string) {
  for (const part of fontStack.split(',')) {
    const family = part.trim().replace(/^['"]|['"]$/g, '');
    if (!family || family.startsWith('var(')) continue;
    const alias = nativeFontAlias(family);
    if (alias) return alias;
  }

  return fallback;
}

// Native navigation uses the platform font. Page content uses bundled Inter Tight.
export const fonts = {
  system: platformSans,
  display: 'InterTight_600SemiBold',
  displayItalic: 'InterTight_400Regular_Italic',
  body: 'InterTight_400Regular',
  bodyMedium: 'InterTight_500Medium',
  bodySemiBold: 'InterTight_600SemiBold',
  bodyBold: 'InterTight_700Bold',
  mono: supportedNativeFamily(mobileThemeFonts.mono, platformMono),
} as const;

export const textStyles = StyleSheet.create({
  title: { fontFamily: fonts.bodySemiBold, fontSize: typography.title, lineHeight: 28, letterSpacing: -0.7 },
  section: { fontFamily: fonts.bodySemiBold, fontSize: typography.h2, lineHeight: 24, letterSpacing: -0.6 },
  body: { fontFamily: fonts.body, fontSize: typography.body, lineHeight: 18, letterSpacing: 0.3 },
  button: { fontFamily: fonts.bodySemiBold, fontSize: typography.body, lineHeight: 18, letterSpacing: 0.1 },
});

// The mobile app intentionally keeps its palette local. The shared theme also
// feeds the future web app, while this product uses a restrained monochrome UI.
export const palettes = {
  light: {
    name: 'Cell Journey Light',
    background: '#F7F7F5',
    surface: '#FFFFFF',
    ink: '#111111',
    text: '#111111',
    strong: '#111111',
    muted: '#666663',
    line: '#E5E5E1',
    track: '#E5E5E1',
    accent: '#111111',
    accentInk: '#FFFFFF',
    success: '#137333',
    danger: '#B42318',
    soft: '#EEEEEB',
    selected: '#E4E4E0',
  },
  dark: {
    name: 'Cell Journey Dark',
    background: '#090909',
    surface: '#151515',
    ink: '#F5F5F3',
    text: '#F5F5F3',
    strong: '#F5F5F3',
    muted: '#A3A3A0',
    line: '#292928',
    track: '#292928',
    accent: '#F5F5F3',
    accentInk: '#111111',
    success: '#58C884',
    danger: '#FF6B6B',
    soft: '#222221',
    selected: '#30302F',
  },
} as const;

export function useAppTheme() {
  return palettes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export type AppTheme = (typeof palettes)[keyof typeof palettes];

export function surfaceShadow(theme: AppTheme, kind: 'card' | 'button' | 'buttonFilled' = 'card'): ViewStyle {
  const dark = theme === palettes.dark;
  const button = kind !== 'card';
  const lightSurface = kind === 'buttonFilled' ? dark : !dark;
  const highlights = button
    ? `inset 0 2px 6px ${lightSurface ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.16)'}, `
    : '';
  return {
    boxShadow: `${highlights}0 1px 2px ${dark ? 'rgba(0,0,0,0.28)' : 'rgba(17,17,17,0.04)'}, 0 ${button ? 3 : 5}px ${button ? 8 : 16}px ${dark ? 'rgba(0,0,0,0.2)' : 'rgba(17,17,17,0.05)'}`,
  };
}

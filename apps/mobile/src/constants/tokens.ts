import { PREVIEW_SHARED_THEME } from './theme-preview';
import { mobileTheme, mobileThemeFonts } from '@cell-journey/theme/mobile';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';

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

// Native navigation uses the platform font. Page content uses bundled Nunito Sans.
export const fonts = {
  system: platformSans,
  display: 'NunitoSans_700Bold',
  displayItalic: 'NunitoSans_400Regular_Italic',
  body: 'NunitoSans_400Regular',
  bodyMedium: 'NunitoSans_500Medium',
  bodySemiBold: 'NunitoSans_600SemiBold',
  bodyBold: 'NunitoSans_700Bold',
  mono: supportedNativeFamily(mobileThemeFonts.mono, platformMono),
} as const;

export const textStyles = StyleSheet.create({
  title: { fontFamily: fonts.bodyBold, fontSize: typography.title, lineHeight: 28, letterSpacing: -0.3 },
  section: { fontFamily: fonts.bodyBold, fontSize: typography.h2, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: typography.body, lineHeight: 20, letterSpacing: 0 },
  button: { fontFamily: fonts.bodySemiBold, fontSize: typography.body, lineHeight: 20, letterSpacing: 0 },
});

// Cell Journey brand palette (design/brand sheet, Oct 2026).
// primary = forest green actions, secondary = leaf green charts/highlights,
// selectedBg = pale green selection, warm = orange dates/accents, alert = notifications.
const originalPalettes = {
  light: {
    name: 'Cell Journey Light',
    background: '#F6F7F3',
    surface: '#FFFFFF',
    ink: '#242424',
    text: '#242424',
    strong: '#242424',
    // #74766F darkened slightly so captions keep 4.5:1 on the off-white background.
    muted: '#6D6F68',
    line: '#E5E7E0',
    track: '#E5E7E0',
    accent: '#3A4D33',
    accentInk: '#FFFFFF',
    primary: '#3A4D33',
    secondary: '#B0DC9E',
    selectedBg: '#E2F5E1',
    warm: '#E9A23B',
    // Deep amber keeps small month labels at 4.5:1 on the cream date tile.
    warmInk: '#A35D00',
    warmSoft: '#FDF1DE',
    alert: '#FF3300',
    success: '#3A7D3A',
    danger: '#E02D00',
    soft: '#EFF1EA',
    selected: '#E2F5E1',
  },
  dark: {
    name: 'Cell Journey Dark',
    background: '#0E110D',
    surface: '#181C16',
    ink: '#F2F4EF',
    text: '#F2F4EF',
    strong: '#F2F4EF',
    muted: '#A2A59C',
    line: '#2A3027',
    track: '#2A3027',
    accent: '#B0DC9E',
    accentInk: '#16210F',
    primary: '#B0DC9E',
    secondary: '#7FB86A',
    selectedBg: '#253322',
    warm: '#F0B35A',
    warmInk: '#F0B35A',
    warmSoft: '#33281A',
    alert: '#FF5A33',
    success: '#8FD27A',
    danger: '#FF6B4D',
    soft: '#222820',
    selected: '#2C3A28',
  },
} as const;

// Preview the active tweakcn palette through the existing native color roles.
// Keep success semantic: the source theme's chart colors are not status colors.
const previewPalettes = {
  light: {
    ...originalPalettes.light,
    ...mobileTheme.light,
    text: mobileTheme.light.ink,
    strong: mobileTheme.light.ink,
    track: mobileTheme.light.line,
    success: '#137333',
  },
  dark: {
    ...originalPalettes.dark,
    ...mobileTheme.dark,
    text: mobileTheme.dark.ink,
    strong: mobileTheme.dark.ink,
    track: mobileTheme.dark.line,
    success: '#58C884',
  },
} as const;

export const palettes = __DEV__ && PREVIEW_SHARED_THEME ? previewPalettes : originalPalettes;

// The app is light mode only, whatever the device setting.
export function useAppTheme() {
  return palettes.light;
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

import { Platform, useColorScheme } from 'react-native';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 18, xl: 24, pill: 999 } as const;
export const typography = { display: 35, title: 31, h1: 26, h2: 20, body: 15, small: 12 } as const;

export const fonts = {
  display: 'Fraunces_400Regular',
  displayItalic: 'Fraunces_400Regular_Italic',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export const palettes = {
  light: {
    name: 'Quiet Chapel', background: '#f8f4ef', surface: '#fffdf9', ink: '#201915', muted: '#756b62',
    line: '#ded6cd', accent: '#5d4030', accentInk: '#fff8f1', success: '#2F6B4F', danger: '#9F3A2F', soft: '#eee5dd', selected: '#eadfd3',
  },
  dark: {
    name: 'Night Mono', background: '#151515', surface: '#1e1e1e', ink: '#f4f1ea', muted: '#aaa49b',
    line: '#333333', accent: '#f4f1ea', accentInk: '#111111', success: '#8BC6A5', danger: '#E08D80', soft: '#242424', selected: '#2c2c2c',
  },
} as const;

export function useAppTheme() {
  return palettes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

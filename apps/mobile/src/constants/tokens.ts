import { mobileTheme, mobileThemeFonts } from '@cell-journey/theme/mobile';
import { Platform, useColorScheme } from 'react-native';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 18, xl: 24, pill: 999 } as const;
export const typography = { display: 35, title: 31, h1: 26, h2: 20, body: 15, small: 12 } as const;

const sansStack = mobileThemeFonts.sans.toLowerCase();
const serifStack = mobileThemeFonts.serif.toLowerCase();

const usesDmSans = sansStack.includes('dm sans') || sansStack.includes('dm-sans');
const usesFraunces = serifStack.includes('fraunces');

const platformSans = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }) ?? 'system-ui';
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

const bodyFont = usesDmSans ? 'DMSans_400Regular' : supportedNativeFamily(mobileThemeFonts.sans, platformSans);
const bodyMediumFont = usesDmSans ? 'DMSans_500Medium' : bodyFont;
const bodySemiBoldFont = usesDmSans ? 'DMSans_600SemiBold' : bodyFont;
const bodyBoldFont = usesDmSans ? 'DMSans_700Bold' : bodyFont;
const displayFont = usesFraunces ? 'Fraunces_400Regular' : supportedNativeFamily(mobileThemeFonts.serif, platformSerif);

export const fonts = {
  display: displayFont,
  displayItalic: usesFraunces ? 'Fraunces_400Regular_Italic' : displayFont,
  body: bodyFont,
  bodyMedium: bodyMediumFont,
  bodySemiBold: bodySemiBoldFont,
  bodyBold: bodyBoldFont,
  mono: supportedNativeFamily(mobileThemeFonts.mono, platformMono),
} as const;

export const palettes = mobileTheme;

export function useAppTheme() {
  return palettes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

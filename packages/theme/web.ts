/**
 * Generated from packages/theme/active-theme.mjs and packages/theme/themes/*.css.
 * Do not edit directly. Change the active theme or theme files, then run `pnpm theme:sync`.
 */

export const activeWebTheme = "invincible-theme";

export const webThemePresets = [
  {
    value: "dane-creativity-lab",
    label: "Dane Creativity Lab"
  },
  {
    value: "dark-forge",
    label: "Dark Forge"
  },
  {
    value: "invincible-theme",
    label: "Invincible Theme"
  }
] as const;

export type WebThemePreset = (typeof webThemePresets)[number];
export type WebThemePresetValue = WebThemePreset['value'];

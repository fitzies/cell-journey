/**
 * Generated from packages/theme/themes/dark-forge.css by packages/theme/scripts/generate-mobile-theme.mjs.
 * Do not edit directly. Change the active theme source, then run `pnpm theme:sync`.
 */

export const mobileTheme = {
  light: {
    name: "Shared Light",
    background: "#faf8f6",
    surface: "#ffffff",
    ink: "#1c1412",
    muted: "#7a706a",
    line: "#e3dbd4",
    accent: "#92400e",
    accentInk: "#ffffff",
    success: "#a16207",
    danger: "#c52525",
    soft: "#f2eee9",
    selected: "#f5dcc8"
  },
  dark: {
    name: "Shared Dark",
    background: "#0c0908",
    surface: "#141110",
    ink: "#e3dad4",
    muted: "#7a706a",
    line: "#28211c",
    accent: "#c2956a",
    accentInk: "#1a0e04",
    success: "#dda15e",
    danger: "#ef4444",
    soft: "#1e1816",
    selected: "#2a1e14"
  }
} as const;

export type MobileThemeName = keyof typeof mobileTheme;
export type MobileTheme = (typeof mobileTheme)[MobileThemeName];

export const mobileThemeFonts = {
  sans: "\"IBM Plex Sans\", \"Inter\", ui-sans-serif, system-ui, -apple-system, sans-serif",
  serif: "\"IBM Plex Serif\", \"Georgia\", ui-serif, serif",
  mono: "\"IBM Plex Mono\", \"Fira Code\", ui-monospace, monospace"
} as const;

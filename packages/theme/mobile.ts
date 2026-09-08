/**
 * Generated from packages/theme/themes/cosbt-01.css by packages/theme/scripts/generate-mobile-theme.mjs.
 * Do not edit directly. Change the active theme source, then run `pnpm theme:sync`.
 */

export const mobileTheme = {
  light: {
    name: "Shared Light",
    background: "#ffffff",
    surface: "#f6f7f3",
    ink: "#242424",
    muted: "#242424",
    line: "#dcdfe2",
    accent: "#b0dc9e",
    accentInk: "#242424",
    success: "#466494",
    danger: "#ef4444",
    soft: "#f9fafb",
    selected: "#e2f5e1"
  },
  dark: {
    name: "Shared Dark",
    background: "#1c2433",
    surface: "#2a3040",
    ink: "#e5e5e5",
    muted: "#a3a3a3",
    line: "#3d4354",
    accent: "#e05d38",
    accentInk: "#ffffff",
    success: "#466494",
    danger: "#ef4444",
    soft: "#2a303e",
    selected: "#2a3656"
  }
} as const;

export type MobileThemeName = keyof typeof mobileTheme;
export type MobileTheme = (typeof mobileTheme)[MobileThemeName];

export const mobileThemeFonts = {
  sans: "Inter, sans-serif",
  serif: "Source Serif 4, serif",
  mono: "Roboto Mono, ui-monospace, monospace"
} as const;

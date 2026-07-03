/**
 * Generated from packages/theme/themes/invincible-theme.css by packages/theme/scripts/generate-mobile-theme.mjs.
 * Do not edit directly. Change the active theme source, then run `pnpm theme:sync`.
 */

export const mobileTheme = {
  light: {
    name: "Shared Light",
    background: "#f8f9fa",
    surface: "#ffffff",
    ink: "#1a1a1a",
    muted: "#2f1313",
    line: "#838181",
    accent: "#facc15",
    accentInk: "#1e3a8a",
    success: "#10b981",
    danger: "#991b1b",
    soft: "#a2bbdd",
    selected: "#ef4444"
  },
  dark: {
    name: "Shared Dark",
    background: "#0f172a",
    surface: "#1e293b",
    ink: "#f8fafc",
    muted: "#94a3b8",
    line: "#334155",
    accent: "#facc15",
    accentInk: "#0f172a",
    success: "#22c55e",
    danger: "#dc2626",
    soft: "#334155",
    selected: "#ef4444"
  }
} as const;

export type MobileThemeName = keyof typeof mobileTheme;
export type MobileTheme = (typeof mobileTheme)[MobileThemeName];

export const mobileThemeFonts = {
  sans: "Inter, system-ui, sans-serif",
  serif: "Georgia, serif",
  mono: "JetBrains Mono, monospace"
} as const;

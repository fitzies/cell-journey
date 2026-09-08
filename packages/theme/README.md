# Cell Journey Theme

Theme switching here is testing-only and build/dev-time.

## Switch active theme

Edit the global switch:

```js
// packages/theme/active-theme.mjs
export const ACTIVE_THEME = 'invincible-theme';
```

Available themes live in `packages/theme/themes/`:

- `cosbt-01` — [COSBT_01 on tweakcn](https://tweakcn.com/themes/cmtpieb6u000004l7gzjv7h8e)
- `invincible-theme`
- `dark-forge`
- `dane-creativity-lab`

Then run:

```sh
pnpm theme:sync
```

This generates:

- `packages/theme/index.css` for web
- `packages/theme/mobile.ts` for mobile
- `packages/theme/web.ts` for the web-only testing select

Do not edit generated files directly.

The web admin also has a runtime testing select next to the light/dark toggle. It sets `html[data-cj-theme]` and only affects the web preview. Expo uses its original monochrome palette by default. To preview a preset, set `PREVIEW_SHARED_THEME = true` in `apps/mobile/src/constants/theme-preview.ts`, choose `ACTIVE_THEME`, and run `pnpm theme:sync`. Set the preview switch back to `false` to restore the original palette. Production always uses the original palette. Reload the app after switching to refresh all navigation styles.

## Mobile color contract

The mobile generator intentionally keeps the mobile palette small. It maps CSS variables into the existing mobile slots only:

| Mobile slot | CSS source order |
| --- | --- |
| `background` | `--background` |
| `surface` | `--card`, `--popover`, `--background` |
| `ink` | `--foreground` |
| `muted` | `--muted-foreground`, `--foreground` |
| `line` | `--border`, `--input` |
| `accent` | `--primary` |
| `accentInk` | `--primary-foreground` |
| `success` | `--success`, `--chart-4`, `--secondary` |
| `danger` | `--destructive` |
| `soft` | `--muted`, `--secondary` |
| `selected` | `--accent`, `--secondary` |

Extra CSS variables like sidebar colors, shadows, spacing, and charts do not create new mobile color slots.

OKLCH colors are converted to native-safe hex values for mobile.

Typography is shared by reading `--font-sans`, `--font-serif`, and `--font-mono`. Native mobile can only use fonts that are loaded in Expo or known platform aliases. Current loaded aliases are DM Sans and Fraunces; known platform aliases include Georgia/serif, system sans, and Courier/monospace.

# Cell Journey Theme

Theme switching here is testing-only and build/dev-time.

## Switch active theme

Edit the global switch:

```js
// packages/theme/active-theme.mjs
export const ACTIVE_THEME = 'invincible-theme';
```

Available themes live in `packages/theme/themes/`:

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

The web admin also has a runtime testing select next to the light/dark toggle. It sets `html[data-cj-theme]` and only affects the web preview. Mobile still follows `ACTIVE_THEME` after `pnpm theme:sync`.

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

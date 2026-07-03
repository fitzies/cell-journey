import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVE_THEME } from '../active-theme.mjs';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(dirname(packageRoot));
const themesPath = join(packageRoot, 'themes');
const themeNames = readdirSync(themesPath)
  .filter((fileName) => fileName.endsWith('.css'))
  .map((fileName) => fileName.slice(0, -4))
  .sort();

if (!themeNames.includes(ACTIVE_THEME)) {
  throw new Error(`Unknown ACTIVE_THEME "${ACTIVE_THEME}". Expected one of: ${themeNames.join(', ')}`);
}

const themeSourcePath = join(themesPath, `${ACTIVE_THEME}.css`);
const cssPath = join(packageRoot, 'index.css');
const mobileOutputPath = join(packageRoot, 'mobile.ts');
const webOutputPath = join(packageRoot, 'web.ts');

const MOBILE_COLOR_MAP = {
  background: ['--background'],
  surface: ['--card', '--popover', '--background'],
  ink: ['--foreground'],
  muted: ['--muted-foreground', '--foreground'],
  line: ['--border', '--input'],
  accent: ['--primary'],
  accentInk: ['--primary-foreground'],
  success: ['--success', '--chart-4', '--secondary'],
  danger: ['--destructive'],
  soft: ['--muted', '--secondary'],
  selected: ['--accent', '--secondary'],
};

const themeSource = readFileSync(themeSourcePath, 'utf8');
const css = buildRuntimeCss(themeSource);
writeIfChanged(cssPath, css);

const lightVars = extractVariables(css, ':root');
const darkVars = extractVariables(css, '.dark');

const mobileTheme = {
  light: buildPalette('Shared Light', lightVars),
  dark: buildPalette('Shared Dark', { ...lightVars, ...darkVars }),
};

const mobileThemeFonts = {
  sans: resolveRaw(lightVars, ['--font-sans'], 'system-ui, sans-serif'),
  serif: resolveRaw(lightVars, ['--font-serif'], 'Georgia, serif'),
  mono: resolveRaw(lightVars, ['--font-mono'], 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'),
};

const output = `/**
 * Generated from packages/theme/themes/${ACTIVE_THEME}.css by packages/theme/scripts/generate-mobile-theme.mjs.
 * Do not edit directly. Change the active theme source, then run \`pnpm theme:sync\`.
 */

export const mobileTheme = ${toTsObject(mobileTheme)} as const;

export type MobileThemeName = keyof typeof mobileTheme;
export type MobileTheme = (typeof mobileTheme)[MobileThemeName];

export const mobileThemeFonts = ${toTsObject(mobileThemeFonts)} as const;
`;

writeIfChanged(mobileOutputPath, output);

const webOutput = `/**
 * Generated from packages/theme/active-theme.mjs and packages/theme/themes/*.css.
 * Do not edit directly. Change the active theme or theme files, then run \`pnpm theme:sync\`.
 */

export const activeWebTheme = ${JSON.stringify(ACTIVE_THEME)};

export const webThemePresets = ${toTsObject(themeNames.map((themeName) => ({ value: themeName, label: labelize(themeName) })))} as const;

export type WebThemePreset = (typeof webThemePresets)[number];
export type WebThemePresetValue = WebThemePreset['value'];
`;

writeIfChanged(webOutputPath, webOutput);
console.log(`Active theme: ${ACTIVE_THEME}`);

function buildRuntimeCss(source) {
  const rootBlock = findBlock(source, ':root');
  if (!rootBlock) throw new Error(`Could not find :root block in ${relativeToRepo(themeSourcePath)}`);

  const darkBlock = findBlock(source, '.dark');
  const rootVars = extractVariablesFromBlock(rootBlock);
  const darkVars = darkBlock ? { ...rootVars, ...extractVariablesFromBlock(darkBlock) } : null;
  const scopedThemes = themeNames.map(buildScopedThemeCss).join('\n');

  return `/*
 * Generated from packages/theme/themes/${ACTIVE_THEME}.css.
 * Do not edit directly. Change ACTIVE_THEME in packages/theme/active-theme.mjs,
 * or edit a source file in packages/theme/themes/, then run \`pnpm theme:sync\`.
 */

:root {${rootBlock}${fontAliases(rootVars)}}
${darkBlock ? `\n.dark {${darkBlock}${fontAliases(darkVars)}}\n` : ''}
/* Runtime web-only test theme selectors. */
${scopedThemes}`;
}

function buildScopedThemeCss(themeName) {
  const source = readFileSync(join(themesPath, `${themeName}.css`), 'utf8');
  const rootBlock = findBlock(source, ':root');
  if (!rootBlock) throw new Error(`Could not find :root block for ${themeName}`);

  const darkBlock = findBlock(source, '.dark');
  const rootVars = extractVariablesFromBlock(rootBlock);
  const darkVars = darkBlock ? { ...rootVars, ...extractVariablesFromBlock(darkBlock) } : null;

  return `html[data-cj-theme="${themeName}"] {${rootBlock}${fontAliases(rootVars)}}
${darkBlock ? `html.dark[data-cj-theme="${themeName}"] {${darkBlock}${fontAliases(darkVars)}}\n` : ''}`;
}

function fontAliases(vars) {
  return `
  --cj-font-sans: ${vars['--font-sans'] ?? 'system-ui, sans-serif'};
  --cj-font-serif: ${vars['--font-serif'] ?? 'Georgia, serif'};
  --cj-font-mono: ${vars['--font-mono'] ?? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'};
`;
}

function buildPalette(name, vars) {
  return Object.fromEntries([
    ['name', name],
    ...Object.entries(MOBILE_COLOR_MAP).map(([mobileKey, cssKeys]) => [
      mobileKey,
      toNativeColor(resolveRaw(vars, cssKeys), vars),
    ]),
  ]);
}

function extractVariables(source, selector) {
  const block = findBlock(source, selector);
  if (!block) {
    if (selector === '.dark') return {};
    throw new Error(`Could not find ${selector} block in ${relativeToRepo(cssPath)}`);
  }

  return extractVariablesFromBlock(block);
}

function extractVariablesFromBlock(block) {
  const vars = {};
  const declarationPattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = declarationPattern.exec(block))) {
    vars[match[1]] = match[2].trim();
  }
  return vars;
}

function findBlock(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selectorPattern = new RegExp(`(^|[{}\\n])\\s*${escapedSelector}\\s*\\{`, 'g');
  const match = selectorPattern.exec(source);
  if (!match) return null;

  const openIndex = match.index + match[0].lastIndexOf('{');
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }

  return null;
}

function resolveRaw(vars, keys, fallback) {
  for (const key of keys) {
    const value = vars[key];
    if (value) return value;
  }
  if (fallback) return fallback;
  throw new Error(`Missing required theme variable. Tried: ${keys.join(', ')}`);
}

function toNativeColor(value, vars, seen = new Set()) {
  const trimmed = stripComments(value).trim();
  const varMatch = trimmed.match(/^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/);
  if (varMatch) {
    const [, varName, fallback] = varMatch;
    if (seen.has(varName)) throw new Error(`Circular CSS variable reference: ${varName}`);
    const resolved = vars[varName] ?? fallback;
    if (!resolved) throw new Error(`Could not resolve CSS variable ${varName}`);
    return toNativeColor(resolved, vars, new Set([...seen, varName]));
  }

  const oklchMatch = trimmed.match(/^oklch\((.+)\)$/i);
  if (oklchMatch) return oklchToHex(oklchMatch[1]);

  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) return normalizeHex(hexMatch[1]);

  if (/^(rgb|rgba|hsl|hsla)\(/i.test(trimmed) || ['black', 'white', 'transparent'].includes(trimmed.toLowerCase())) {
    return trimmed;
  }

  throw new Error(`Unsupported mobile color value: ${value}. Use hex, rgb/hsl, transparent, or oklch().`);
}

function stripComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, '');
}

function normalizeHex(hex) {
  const value = hex.toLowerCase();
  if (value.length === 3 || value.length === 4) {
    return `#${value.split('').map((char) => char + char).join('')}`;
  }
  if (value.length === 6 || value.length === 8) return `#${value}`;
  throw new Error(`Invalid hex color: #${hex}`);
}

function oklchToHex(input) {
  const parts = input
    .replace(/,/g, ' ')
    .split('/')
    .at(0)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length < 3) throw new Error(`Invalid oklch() color: oklch(${input})`);

  const l = parseChannel(parts[0], 1);
  const c = parseFloat(parts[1]);
  const h = parts[2].toLowerCase() === 'none' ? 0 : parseFloat(parts[2]);

  if (![l, c, h].every(Number.isFinite)) throw new Error(`Invalid oklch() color: oklch(${input})`);

  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;

  const lCubed = lPrime ** 3;
  const mCubed = mPrime ** 3;
  const sCubed = sPrime ** 3;

  const redLinear = 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed;
  const greenLinear = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed;
  const blueLinear = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed;

  return rgbToHex(linearToSrgb(redLinear), linearToSrgb(greenLinear), linearToSrgb(blueLinear));
}

function parseChannel(value, scale) {
  return value.endsWith('%') ? parseFloat(value) / 100 : parseFloat(value) / scale;
}

function linearToSrgb(value) {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function toTsObject(value) {
  return JSON.stringify(value, null, 2).replace(/"([^"\\]+)":/g, '$1:');
}

function labelize(value) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function writeIfChanged(path, output) {
  const previous = safeRead(path);
  if (previous !== output) {
    writeFileSync(path, output);
    console.log(`Generated ${relativeToRepo(path)}`);
  } else {
    console.log(`${relativeToRepo(path)} is already up to date`);
  }
}

function safeRead(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function relativeToRepo(path) {
  return path.replace(`${workspaceRoot}/`, '');
}

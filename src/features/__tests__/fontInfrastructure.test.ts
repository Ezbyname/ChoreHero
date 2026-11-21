// Slice 3: Rubik font infrastructure (Expo SDK 56). This test covers
// infrastructure only. No existing screen is migrated to Rubik.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

import { createFontReadiness, FONT_LOAD_TIMEOUT_MS, isFontStatusSettled, type FontStatus } from '@/features/startup/fontReadiness';
import { isStartupReady, shouldDismissSplash, SPLASH_MAX_VISIBLE_MS, SPLASH_MIN_VISIBLE_MS } from '@/features/startup/startupSplashRules';
import { lockedTextStyle, RUBIK, RUBIK_BY_WEIGHT, rubikFamilyForWeight, typeScale } from '@/theme';

const ROOT = new URL('../../../', import.meta.url);
const SRC  = new URL('../../', import.meta.url);
const json = (rel: string) => JSON.parse(readFileSync(new URL(rel, ROOT), 'utf8'));
const code = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// ── Dependency ──────────────────────────────────────────────────────────────

test('expo-font is a direct dependency at the SDK 56 bundled version', () => {
  const pkg = json('package.json');
  const bundled = json('node_modules/expo/bundledNativeModules.json');
  assert.equal(pkg.dependencies['expo-font'], '~56.0.7');
  assert.equal(pkg.dependencies['expo-font'], bundled['expo-font']);
  assert.match(pkg.dependencies.expo, /^~56\./, 'Expo SDK not upgraded');
});

test('lockfile resolves exactly one expo-font, at 56.x', () => {
  const lock = json('package-lock.json');
  const copies = Object.entries(lock.packages as Record<string, { version: string }>)
    .filter(([k]) => k === 'node_modules/expo-font' || k.endsWith('/node_modules/expo-font'));
  assert.deepEqual(copies.map(([k, v]) => `${k}@${v.version}`), ['node_modules/expo-font@56.0.7']);
});

test('every expo-* dependency stays on SDK 56 (no unrelated upgrade)', () => {
  const deps = json('package.json').dependencies as Record<string, string>;
  const off = Object.entries(deps).filter(([k, v]) => k.startsWith('expo-') && !/^~56\./.test(v));
  assert.deepEqual(off, []);
});

// ── Assets ──────────────────────────────────────────────────────────────────

function usWeightClass(file: URL): number {
  const b = readFileSync(file);
  assert.equal(b.readUInt32BE(0), 0x00010000, 'TrueType signature');
  const n = b.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (b.toString('latin1', o, o + 4) === 'OS/2') return b.readUInt16BE(b.readUInt32BE(o + 8) + 4);
  }
  throw new Error('no OS/2 table');
}

test('Rubik 400/500/600/700/800 are bundled as static TTFs whose embedded weight matches the family', () => {
  for (const [weight, family] of Object.entries(RUBIK_BY_WEIGHT)) {
    const file = new URL(`assets/fonts/${family}.ttf`, ROOT);
    assert.ok(existsSync(file), family);
    assert.equal(usWeightClass(file), Number(weight), family);
  }
});

test('the OFL licence ships next to the fonts', () => {
  const ofl = readFileSync(new URL('assets/fonts/OFL.txt', ROOT), 'utf8');
  assert.ok(ofl.includes('SIL Open Font License, Version 1.1'));
  assert.ok(ofl.includes('The Rubik Project Authors'));
});

test('every Rubik family is registered with expo-font, one binary each', () => {
  const src = code('features/startup/fontLoader.ts');
  assert.ok(src.includes("from 'expo-font'"));
  for (const key of Object.keys(RUBIK)) {
    const family = RUBIK[key as keyof typeof RUBIK];
    assert.ok(src.includes(`[RUBIK.${key}]:`), key);
    assert.ok(src.includes(`require('../../../assets/fonts/${family}.ttf')`), family);
  }
});

// ── Family + type-scale mapping ─────────────────────────────────────────────

test('family mapping is complete and deterministic', () => {
  assert.deepEqual(Object.keys(RUBIK_BY_WEIGHT).map(Number), [400, 500, 600, 700, 800]);
  assert.equal(new Set(Object.values(RUBIK_BY_WEIGHT)).size, 5);
  assert.equal(rubikFamilyForWeight(undefined), RUBIK.regular);
  assert.equal(rubikFamilyForWeight('normal'), RUBIK.regular);
  assert.equal(rubikFamilyForWeight('bold'), RUBIK.bold);
  assert.equal(rubikFamilyForWeight('500'), RUBIK.medium);
  assert.equal(rubikFamilyForWeight('600'), RUBIK.semiBold);
  assert.equal(rubikFamilyForWeight('800'), RUBIK.extraBold);
  assert.equal(rubikFamilyForWeight('100'), RUBIK.regular);  // clamped
  assert.equal(rubikFamilyForWeight('900'), RUBIK.extraBold); // clamped
});

test('semantic type scale maps to the right Rubik family when ready', () => {
  const fam = (t: keyof typeof typeScale) => lockedTextStyle(t, true).fontFamily;
  assert.equal(fam('displayChild'), RUBIK.extraBold); // Child display 800
  assert.equal(fam('display'), RUBIK.bold);
  assert.equal(fam('h1'), RUBIK.bold);
  assert.equal(fam('h2'), RUBIK.bold);
  assert.equal(fam('title'), RUBIK.semiBold);
  assert.equal(fam('body'), RUBIK.regular);
  assert.equal(fam('caption'), RUBIK.regular);
  assert.equal(fam('overline'), RUBIK.bold);
  const d = lockedTextStyle('display', true);
  assert.equal(d.fontSize, 26);
  assert.equal(d.lineHeight, 29);
  assert.equal(d.fontWeight, 'normal', 'Android: the family carries the weight, not fontWeight');
});

test('fallback: not ready = system font with the locked size and weight, no fontFamily', () => {
  for (const t of Object.keys(typeScale) as (keyof typeof typeScale)[]) {
    const s = lockedTextStyle(t, false);
    assert.equal('fontFamily' in s, false, t);
    assert.equal(s.fontWeight, typeScale[t].fontWeight, t);
    assert.equal(s.fontSize, typeScale[t].fontSize, t);
  }
});

// ── Readiness / fallback state machine ──────────────────────────────────────

function harness(load: () => Promise<void>) {
  let timerFn: (() => void) | null = null;
  let cleared = false;
  const messages: string[] = [];
  const r = createFontReadiness({
    load,
    setTimer:     (fn) => { timerFn = fn; return 1; },
    clearTimer:   () => { cleared = true; },
    onDiagnostic: (m) => { messages.push(m); },
  });
  return { r, fireTimeout: () => timerFn?.(), wasCleared: () => cleared, messages };
}

const flush = () => new Promise((res) => setImmediate(res));

test('load success → ready; timer cleared; idempotent start', async () => {
  let calls = 0;
  const h = harness(async () => { calls += 1; });
  const seen: FontStatus[] = [];
  h.r.subscribe(() => seen.push(h.r.getStatus()));
  h.r.start(); h.r.start();
  await flush();
  assert.equal(calls, 1);
  assert.equal(h.r.getStatus(), 'ready');
  assert.ok(h.wasCleared());
  assert.deepEqual(seen, ['loading', 'ready']);
});

test('load rejection → failed (system font) with a diagnostic, never throws', async () => {
  const h = harness(() => Promise.reject(new Error('ERR_FONT_SOURCE')));
  h.r.start();
  await flush();
  assert.equal(h.r.getStatus(), 'failed');
  assert.equal(h.messages.length, 1);
});

test('synchronous loader throw → failed, never crashes startup', async () => {
  const h = harness(() => { throw new Error('boom'); });
  assert.doesNotThrow(() => h.r.start());
  await flush();
  assert.equal(h.r.getStatus(), 'failed');
});

test('hung load → timeout settles failed; a late success does not flip fonts mid-session', async () => {
  let resolve!: () => void;
  const h = harness(() => new Promise<void>((r) => { resolve = r; }));
  h.r.start();
  assert.equal(h.r.getStatus(), 'loading');
  h.fireTimeout();
  assert.equal(h.r.getStatus(), 'failed');
  resolve();
  await flush();
  assert.equal(h.r.getStatus(), 'failed');
});

test('font timeout sits inside the splash minimum and well below its safety cap', () => {
  assert.ok(FONT_LOAD_TIMEOUT_MS <= SPLASH_MIN_VISIBLE_MS);
  assert.ok(FONT_LOAD_TIMEOUT_MS < SPLASH_MAX_VISIBLE_MS);
  assert.equal(isFontStatusSettled('loading'), false);
  assert.equal(isFontStatusSettled('idle'), false);
  assert.equal(isFontStatusSettled('failed'), true);
});

// ── Startup gate ────────────────────────────────────────────────────────────

const READY_SIGNALS = { supabaseConfigured: true, isAuthResolved: true, isAuthLoading: false, isAuthenticated: false, appHydrationState: 'idle' as const };

test('startup is not ready until fonts settle; failure still counts as settled', () => {
  assert.equal(isStartupReady({ ...READY_SIGNALS, fontsSettled: false }), false);
  assert.equal(isStartupReady({ ...READY_SIGNALS, fontsSettled: true }), true);
  assert.equal(isStartupReady({ ...READY_SIGNALS, supabaseConfigured: false, fontsSettled: false }), false);
  // Callers that predate fonts keep their behaviour.
  assert.equal(isStartupReady(READY_SIGNALS), true);
  // The safety cap still lifts the splash even if fonts never settle.
  assert.equal(shouldDismissSplash({ elapsedMs: SPLASH_MAX_VISIBLE_MS, ready: false }), true);
});

test('fonts start once at app module scope and the existing splash consumes the signal (no second splash)', () => {
  const app = readFileSync(new URL('App.tsx', ROOT), 'utf8');
  assert.ok(/^startFontLoading\(\);/m.test(app));
  assert.ok(!/SplashScreen|expo-splash-screen|useFonts/.test(app));
  const splash = code('features/startup/StartupSplash.tsx');
  assert.ok(splash.includes('const fontsSettled      = useFontsSettled();'));
  assert.ok(splash.includes('appHydrationState, fontsSettled })'));
  // The splash has no text of its own (the logo is painted in the art), so
  // nothing on it depends on Rubik.
  assert.ok(!splash.includes('<Text'));
});

// ── No global migration ─────────────────────────────────────────────────────

function uiFiles(dirRel: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(new URL(rel, SRC))) {
      const child = `${rel}${name}`;
      if (statSync(new URL(child, SRC)).isDirectory()) { if (name !== '__tests__') walk(`${child}/`); }
      else if (name.endsWith('.tsx')) out.push(child);
    }
  };
  walk(dirRel);
  return out;
}

test('only the Child Home (Slice 5A) uses Rubik; no other screen or component is migrated', () => {
  const ui = [...uiFiles('screens/'), ...uiFiles('features/'), ...uiFiles('components/'), ...uiFiles('navigation/')];
  const offenders = ui.filter((f) => /Rubik|lockedTextStyle|useRubikReady|fontFamily/.test(code(f)));
  // Slice 5C: the child Submit Evidence screen takes Rubik directly (it
  // cannot import the Child Home screen: that would be a require cycle).
  // Slice 6A: the Adult Home uses the adult type scale (lockedTextStyle).
  assert.deepEqual(offenders.sort(), ['features/tasks/components/ChildSubmitEvidence.tsx', 'screens/AdultHomeScreen.tsx', 'screens/ChildHomeScreen.tsx']);
  // The legacy typography object carries no font family.
  assert.ok(!code('theme/typography.ts').includes('fontFamily:'));
});

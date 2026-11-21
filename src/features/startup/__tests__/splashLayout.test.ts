// Startup splash layout (owner splash set 2026-11-20): full-bleed portrait
// art with the logo painted in, covering the screen under the status bar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  SPLASH_ART_ASPECT,
  SPLASH_ART_HEIGHT,
  SPLASH_ART_WIDTH,
  SPLASH_IMAGE_COUNT,
  SPLASH_MIN_VISIBLE_MS,
  pickSplashIndex,
  shouldDismissSplash,
  splashCoverFrame,
} from '@/features/startup/startupSplashRules';
import { colors } from '@/theme/colors';

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const PHONE  = { width: 412, height: 915, insetTop: 24 };   // tall Android (~9:20)
const SMALL  = { width: 360, height: 640, insetTop: 24 };   // small Android (9:16)
const TABLET = { width: 800, height: 1280, insetTop: 24 };  // portrait tablet (wider than 9:16)
const DEVICES = [PHONE, SMALL, TABLET, { width: 1280, height: 800, insetTop: 24 }, { width: 393, height: 852, insetTop: 59 }];

// Width x height of a lossy (VP8), lossless (VP8L) or extended (VP8X) WebP.
function webpSize(b: Buffer): { width: number; height: number } {
  const chunk = b.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
}

test('every bundled splash image is the 941x1672 portrait art the layout assumes', () => {
  const dir = new URL('../../../../assets/splash/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.webp')).sort();
  assert.equal(files.length, SPLASH_IMAGE_COUNT);
  for (const f of files) {
    assert.deepEqual(webpSize(readFileSync(new URL(f, dir))), { width: SPLASH_ART_WIDTH, height: SPLASH_ART_HEIGHT }, f);
  }
});

test('cover: fills the whole screen below the status bar on every device, aspect preserved', () => {
  for (const dev of DEVICES) {
    const f = splashCoverFrame(dev);
    assert.equal(f.top, dev.insetTop, 'top pinned under the status bar (logo never behind it)');
    assert.ok(f.left <= 0 && f.left + f.width >= dev.width, `covers the width ${dev.width}`);
    assert.ok(f.top + f.height >= dev.height, `covers to the bottom ${dev.height}`);
    assert.ok(Math.abs(f.width / f.height - SPLASH_ART_ASPECT) < 0.01, 'no distortion');
  }
});

test('cover: tall phones trim the sides evenly; wide screens trim only the bottom', () => {
  const p = splashCoverFrame(PHONE);
  assert.equal(p.height, Math.ceil(p.width / SPLASH_ART_ASPECT));
  assert.ok(p.width > PHONE.width, 'tall phone is height-limited');
  const overhang = p.width - PHONE.width;
  assert.ok(Math.abs(-p.left - overhang / 2) <= 1, 'centred horizontally');

  const t = splashCoverFrame(TABLET);
  assert.equal(t.width, TABLET.width);
  assert.equal(t.left, 0);
  assert.ok(t.top + t.height > TABLET.height, 'extra height runs off the bottom, never the top');
});

test('cover: bad input is safe', () => {
  const nan = splashCoverFrame({ ...PHONE, aspect: Number.NaN });
  assert.deepEqual(nan, splashCoverFrame(PHONE), 'falls back to the art aspect');
  assert.deepEqual(splashCoverFrame({ width: 0, height: 0, insetTop: 0 }), { width: 0, height: 0, left: 0, top: 0 });
});

test('no separate text title (the logo is in the art), dark-green backdrop, light status bar, cover', () => {
  const src = code('../StartupSplash.tsx');
  assert.ok(!src.includes('<Text'), 'no duplicate ChoreHero text title');
  assert.ok(src.includes('resizeMode="cover"'));
  assert.ok(src.includes('splashCoverFrame({'));
  assert.ok(!src.includes('resolveAssetSource'), 'no asset-metadata API (missing on web)');
  assert.ok(src.includes('<StatusBar style="light" />'));
  assert.ok(src.includes('backgroundColor: colors.splash'));
  assert.ok(!/borderRadius/.test(src), 'no card treatment');
  assert.match(colors.splash, /^#[0-9A-F]{6}$/i);
  assert.notEqual(colors.splash.toUpperCase(), '#FFFFFF', 'no white frame around the full-bleed art');
});

test('native launch screen is the same dark green as the in-app splash (no white flash), with a blank icon', () => {
  const app = JSON.parse(readFileSync(new URL('../../../../app.json', import.meta.url), 'utf8'));
  const entry = (app.expo.plugins ?? []).find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert.ok(entry, 'expo-splash-screen config plugin configured');
  const opts = entry[1];
  assert.equal(opts.backgroundColor.toUpperCase(), colors.splash.toUpperCase());
  assert.equal(opts.image, './assets/native-splash-blank.png');
  // The icon is fully transparent: the native screen is a solid colour that blends into the art.
  const png = readFileSync(new URL('../../../../assets/native-splash-blank.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  // No top-level legacy `splash` key competing with the plugin.
  assert.equal(app.expo.splash, undefined);
});

test('no white hand-off: the app window is splash green and the splash is in React\'s first frame (vc22)', () => {
  const app = JSON.parse(readFileSync(new URL('../../../../app.json', import.meta.url), 'utf8'));
  // Prebuild writes this into AppTheme android:windowBackground (expo-system-ui
  // fallback plugin), replacing the light theme's default white window.
  assert.equal(app.expo.android.backgroundColor.toUpperCase(), colors.splash.toUpperCase());
  // Without initialMetrics SafeAreaProvider renders no children on the first
  // frame, so the window showed through before StartupSplash mounted.
  const root = readFileSync(new URL('../../../../App.tsx', import.meta.url), 'utf8');
  assert.ok(root.includes('<SafeAreaProvider initialMetrics={initialWindowMetrics}>'));
  assert.ok(/import \{[^}]*initialWindowMetrics[^}]*\} from 'react-native-safe-area-context'/.test(root));
});

test('random image per cold start and the ~4.5 s presentation are unchanged', () => {
  assert.equal(SPLASH_MIN_VISIBLE_MS, 4500);
  assert.equal(shouldDismissSplash({ elapsedMs: 4499, ready: true }), false);
  assert.equal(shouldDismissSplash({ elapsedMs: 4500, ready: true }), true);
  assert.equal(pickSplashIndex(() => 0.5, 8), 4);
  const src = code('../StartupSplash.tsx');
  assert.ok(/^const chosenIndex = pickSplashIndex\(Math\.random, SPLASH_IMAGES\.length\);/m.test(src));
});

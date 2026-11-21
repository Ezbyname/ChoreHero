// Android QA gate (vc13): at 130% system font the bottom-tab labels were
// clipped on Android (fixed 49dp bar). The bar now grows with the font scale;
// at 100% it is untouched.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { TAB_BAR_BASE_HEIGHT, tabBarExtraHeight, tabBarHeightFor } from '@/navigation/tabBarMetrics';

const SRC = new URL('../../', import.meta.url);
const code = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

test('font scale 1.0 (and below or invalid) keeps the library default bar: no explicit height', () => {
  for (const s of [1, 0.85, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(tabBarExtraHeight(s), 0, `scale ${s}`);
    assert.equal(tabBarHeightFor(s, 48), null, `scale ${s}`);
  }
});

test('the bar grows with the label: 130% fits a 12sp label line plus its descenders', () => {
  // A 16dp label line at 1.0 is 20.8dp at 1.3: 5dp growth, plus a 2dp margin.
  assert.equal(tabBarExtraHeight(1.3), 7);
  assert.equal(tabBarExtraHeight(1.15), 5);
  assert.equal(tabBarExtraHeight(2), 18);
  assert.ok(tabBarExtraHeight(1.3) >= Math.ceil(16 * 1.3) - 16, 'covers the label growth');
});

test('the explicit height includes the bottom inset (bottom-tabs pads it inside the height)', () => {
  assert.equal(tabBarHeightFor(1.3, 48), TAB_BAR_BASE_HEIGHT + 7 + 48);
  assert.equal(tabBarHeightFor(1.3, 0), TAB_BAR_BASE_HEIGHT + 7);
  assert.equal(tabBarHeightFor(1.3, -5), TAB_BAR_BASE_HEIGHT + 7, 'a negative inset is ignored');
  assert.equal(TAB_BAR_BASE_HEIGHT, 49);
});

test('both shells use the font-aware tab options; labels still scale (no allowFontScaling: false)', () => {
  const s = code('navigation/AppTabs.tsx');
  assert.equal([...s.matchAll(/const screenOptions = useTabScreenOptions\(\);/g)].length, 2, 'ChildTabs and AdultTabs');
  assert.equal([...s.matchAll(/screenOptions=\{screenOptions\}/g)].length, 2);
  assert.ok(!/screenOptions=\{SCREEN_OPTIONS\}/.test(s), 'no shell keeps the fixed-height options');
  assert.ok(s.includes('tabBarHeightFor(fontScale, bottom)'));
  assert.ok(s.includes('height === null ? SCREEN_OPTIONS'), 'unchanged object at 100%');
  assert.ok(!/allowFontScaling:\s*false|tabBarAllowFontScaling:\s*false/.test(s), 'accessibility scaling is kept');
});

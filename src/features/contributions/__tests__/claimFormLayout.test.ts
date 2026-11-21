// vc14 Android correction gate: at 130% font the Helpful placeholder
// "What did you do?" was cut to "What did you". The form stacks instead.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { CLAIM_ROW_MIN_SCALED_WIDTH, claimFormStacked } from '@/features/contributions/claimFormLayout';

const SRC = new URL('../../../', import.meta.url);
const code = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

test('100% font keeps the one-row form on every tested phone width', () => {
  for (const w of [360, 390, 412]) assert.equal(claimFormStacked(w, 1), false, `${w}dp`);
});

test('130% font stacks the form at 360 and 390 (and 412) instead of clipping', () => {
  for (const w of [360, 390, 412]) assert.equal(claimFormStacked(w, 1.3), true, `${w}dp`);
  assert.equal(CLAIM_ROW_MIN_SCALED_WIDTH, 340);
});

test('invalid inputs fall back to the row (the pre-vc14 layout)', () => {
  assert.equal(claimFormStacked(0, 1.3), false);
  assert.equal(claimFormStacked(Number.NaN, 1.3), false);
  assert.equal(claimFormStacked(360, Number.NaN), false);
  assert.equal(claimFormStacked(360, 0), false);
});

test('the form wires the stacked layout; copy, font scaling and submit logic are unchanged', () => {
  const s = code('screens/TodayScreen.tsx');
  assert.ok(s.includes('const stacked = claimFormStacked(windowWidth, fontScale);'));
  assert.ok(s.includes('[styles.claimRow, stacked && styles.claimRowStacked]'));
  assert.ok(s.includes('[styles.claimInput, stacked && styles.claimInputStacked]'));
  assert.ok(s.includes('styles.claimSubmitButton, stacked && styles.claimSubmitStacked'));
  assert.match(s, /claimRowStacked: \{\s*flexDirection: 'column',/);
  assert.ok(s.includes('placeholder={copy.contributionClaims.claimFieldPlaceholder}'), 'placeholder copy not shortened');
  assert.ok(s.includes('minWidth: 0'), 'the Slice 5A.1 narrow-row fix is kept');
  assert.ok(!/allowFontScaling=\{false\}|maxFontSizeMultiplier/.test(s), 'font scaling is not disabled');
  assert.ok(s.includes('onPress={handleSubmit}') && s.includes('canSubmitClaim(phase, title)'), 'submit flow unchanged');
});

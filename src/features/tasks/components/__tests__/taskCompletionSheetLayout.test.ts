import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PREVIEW_MAX_HEIGHT_RATIO,
  PREVIEW_MIN_HEIGHT,
  SHEET_MAX_HEIGHT_RATIO,
  computeCompletionSheetLayout,
} from '@/features/tasks/components/taskCompletionSheetLayout';

// Rough worst-case height of everything in the sheet except the preview at
// font scale 1.3: title, task title (2 lines), hint, a wrapped row of photo
// actions (2 rows), the error box, Submit, Cancel, padding and gaps.
const NON_PREVIEW_CONTENT_AT_1_3X = 520;

const PHONES = [
  { name: 'small Android 360x640', windowWidth: 360, windowHeight: 640 },
  { name: 'common Android 393x851', windowWidth: 393, windowHeight: 851 },
  { name: 'tall Android 412x915', windowWidth: 412, windowHeight: 915 },
  { name: 'landscape 851x393', windowWidth: 851, windowHeight: 393 },
];

for (const phone of PHONES) {
  test(`${phone.name}: sheet stays below 90% of the window and the preview no longer eats the footer`, () => {
    const layout = computeCompletionSheetLayout({ ...phone, horizontalPadding: 20 });
    assert.ok(layout.sheetMaxHeight <= phone.windowHeight * SHEET_MAX_HEIGHT_RATIO + 1);
    assert.ok(layout.previewHeight <= Math.max(PREVIEW_MIN_HEIGHT, phone.windowHeight * PREVIEW_MAX_HEIGHT_RATIO) + 1);
    assert.ok(layout.previewHeight <= phone.windowWidth - 40 || layout.previewHeight === PREVIEW_MIN_HEIGHT);
  });
}

test('the old full-width square preview could not fit with the footer on a 360x640 phone; the capped one leaves room', () => {
  const phone = PHONES[0];
  const oldSquare = phone.windowWidth - 40; // aspectRatio: 1 at full content width
  const layout = computeCompletionSheetLayout({ ...phone, horizontalPadding: 20 });
  assert.ok(oldSquare + NON_PREVIEW_CONTENT_AT_1_3X > layout.sheetMaxHeight);
  assert.ok(layout.previewHeight < oldSquare);
  // Even where the body still overflows, the footer is outside the
  // ScrollView, so only the preview/actions scroll — Submit stays visible.
});

test('preview never collapses below the minimum on a very short window', () => {
  const layout = computeCompletionSheetLayout({ windowWidth: 800, windowHeight: 200, horizontalPadding: 20 });
  assert.equal(layout.previewHeight, PREVIEW_MIN_HEIGHT);
});

test('narrow window: preview follows the content width when that is the smaller bound', () => {
  const layout = computeCompletionSheetLayout({ windowWidth: 300, windowHeight: 2000, horizontalPadding: 20 });
  assert.equal(layout.previewHeight, 260);
});

// Reviewer side of multi-photo evidence: the gallery state, the decision
// gate over N photos, and the modal's Close / stale behaviour.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  gallerySummary,
  initialGallery,
  loadOrder,
  onRetryFailed,
  onSlotFailed,
  onSlotReady,
  positionLabel,
  selectNext,
  selectPrevious,
  selectSlot,
} from '@/features/tasks/components/evidenceGalleryState';
import {
  canConfirmDecision,
  initialReviewState,
  missingEvidenceIndexes,
  onActionNotPending,
  onBeginApprove,
  onContextLoaded,
  onEvidenceFailed,
  onEvidenceLoaded,
  onEvidenceRetry,
  isTerminalPhase,
} from '@/features/tasks/components/taskReviewEvidenceUiState';

const ctx = (photoCount: number | undefined, hasPhoto = (photoCount ?? 0) > 0) => ({
  submissionId: 'sub-1', taskId: 't-1', submittedByProfileId: 'child-1', submittedAt: '2026-10-30T00:00:00Z', hasPhoto, photoCount,
});

// ── gallery ─────────────────────────────────────────────────────────────────

test('gallery: one slot per photo, visible photo loads first, prev/next stay in range, "2 / 3" label', () => {
  let g = initialGallery(3);
  assert.deepEqual(loadOrder(g), [0, 1, 2]);
  g = selectSlot(g, 2);
  assert.deepEqual(loadOrder(g), [2, 0, 1]);
  assert.equal(positionLabel(g), '3 / 3');
  assert.equal(selectNext(g).selected, 2);
  g = selectPrevious(selectPrevious(selectPrevious(g)));
  assert.equal(g.selected, 0);
  assert.equal(positionLabel(selectNext(g)), '2 / 3');
});

test('gallery: summary tracks ready / failed; retry only reloads the failed photos', () => {
  let g = initialGallery(3);
  g = onSlotReady(g, 0, 'file:///a.jpg');
  g = onSlotFailed(g, 1);
  g = onSlotReady(g, 2, 'file:///c.jpg');
  assert.deepEqual(gallerySummary(g), { total: 3, ready: 2, failed: 1, allReady: false });
  g = onRetryFailed(g);
  assert.deepEqual(loadOrder(g), [1]);
  g = onSlotReady(g, 1, 'file:///b.jpg');
  assert.equal(gallerySummary(g).allReady, true);
});

// ── decision gate over N photos ─────────────────────────────────────────────

test('5 photos: Approve/Reject stay blocked until EVERY photo is loaded', () => {
  let s = onContextLoaded(initialReviewState('approve'), ctx(5));
  assert.equal(s.phase, 'loading_evidence');
  assert.equal(s.evidenceUris.length, 5);
  for (const i of [0, 1, 2, 3]) {
    s = onEvidenceLoaded(s, `file:///p${i}.jpg`, i);
    assert.equal(canConfirmDecision(s), false, `after photo ${i}`);
  }
  s = onEvidenceLoaded(s, 'file:///p4.jpg', 4);
  assert.equal(s.phase, 'ready_with_photo');
  assert.equal(canConfirmDecision(s), true);
  assert.equal(s.evidenceUri, 'file:///p0.jpg');
});

test('one failed photo blocks the decision; retry keeps loaded photos and only the missing ones load', () => {
  let s = onContextLoaded(initialReviewState('reject'), ctx(3));
  s = onEvidenceLoaded(s, 'file:///p0.jpg', 0);
  s = onEvidenceFailed(s);
  s = onEvidenceLoaded(s, 'file:///p2.jpg', 2); // arrives after the failure
  assert.equal(s.phase, 'evidence_failed');
  assert.equal(canConfirmDecision(s), false);
  assert.deepEqual(missingEvidenceIndexes(s), [1]);
  s = onEvidenceRetry(s);
  assert.equal(s.phase, 'loading_evidence');
  s = onEvidenceLoaded(s, 'file:///p1.jpg', 1);
  assert.equal(canConfirmDecision(s), true);
});

test('0 photos -> decidable at once; old single-photo context (no photoCount) behaves as 1 photo', () => {
  assert.equal(onContextLoaded(initialReviewState('approve'), ctx(0)).phase, 'ready_no_photo');
  let legacy = onContextLoaded(initialReviewState('approve'), ctx(undefined, true));
  assert.equal(legacy.evidenceUris.length, 1);
  legacy = onEvidenceLoaded(legacy, 'file:///only.jpg');
  assert.equal(canConfirmDecision(legacy), true);
});

test('out-of-range photo results are ignored', () => {
  const s = onContextLoaded(initialReviewState('approve'), ctx(2));
  assert.equal(onEvidenceLoaded(s, 'file:///x.jpg', 7), s);
});

test('stale (CH017) after photos were seen: terminal, no further decision possible', () => {
  let s = onContextLoaded(initialReviewState('approve'), ctx(1));
  s = onEvidenceLoaded(s, 'file:///p.jpg', 0);
  s = onActionNotPending(onBeginApprove(s)!);
  assert.equal(isTerminalPhase(s), true);
  assert.equal(canConfirmDecision(s), false);
});

// ── modal structure: Close / X ──────────────────────────────────────────────

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

test('reviewer modal: X header is rendered unconditionally (loading / evidence / error / stale) and Close never decides', () => {
  const modal = code('../TaskReviewEvidenceModal.tsx');
  // The header sits outside every phase conditional, with no closeDisabled.
  assert.ok(/<SheetHeader\s+title=\{copy\.taskReview\.title\}[\s\S]*?onClose=\{handleClose\}[\s\S]*?closeLabel=\{copy\.taskReview\.close\}\s*\/>/.test(modal));
  assert.ok(!/<SheetHeader[^>]*closeDisabled/.test(modal));
  const close = modal.slice(modal.indexOf('function handleClose()'), modal.indexOf('const isActionBusy'));
  assert.ok(!/approve|reject|Approve|Reject|setState/.test(close), 'close must not decide or mutate');
  assert.ok(close.includes('onClose();'));
  // Android hardware back goes through the same handler.
  assert.ok(modal.includes('onRequestClose={handleClose}'));
  // Stale / terminal state offers a Close button too.
  assert.ok(/terminal \? \(\s*<AppButton label=\{copy\.taskReview\.close\} onPress=\{handleClose\}/.test(modal));
});

test('sheets: SheetHeader X is an accessible icon button with a 44dp target', () => {
  const header = code('../../../../components/ui/SheetHeader.tsx');
  assert.ok(header.includes('<IconButton icon="close" accessibilityLabel={closeLabel}'));
  const icon = code('../../../../components/ui/IconButton.tsx');
  assert.ok(icon.includes("accessibilityRole=\"button\""));
  assert.ok(icon.includes('width:          sizes.iconButton'));
});

test('child sheets also have the X: completion sheet (disabled only mid-submit) and pending sheet', () => {
  const completion = code('../TaskCompletionModal.tsx');
  assert.ok(/<SheetHeader[\s\S]*?closeDisabled=\{isSubmitting\}/.test(completion));
  const pending = code('../PendingCompletionModal.tsx');
  assert.ok(/<SheetHeader[\s\S]*?closeDisabled=\{state\.phase === 'withdrawing'\}/.test(pending));
});

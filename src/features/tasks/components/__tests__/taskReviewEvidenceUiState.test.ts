import assert from 'node:assert/strict';
import test from 'node:test';

import type { TaskCompletionReviewContext } from '@/features/tasks/getTaskCompletionReviewContext';
import {
  canConfirmDecision,
  initialReviewState,
  isTerminalPhase,
  onActionFailed,
  onActionNotAuthorized,
  onActionNotPending,
  onBeginApprove,
  onBeginReject,
  onContextFailed,
  onContextLoaded,
  onContextNotAuthorized,
  onContextNotFound,
  onEvidenceFailed,
  onEvidenceLoaded,
  onEvidenceRetry,
  onReturnToReady,
} from '@/features/tasks/components/taskReviewEvidenceUiState';

const noPhotoContext: TaskCompletionReviewContext = {
  submissionId:         'sub-1',
  taskId:               'task-1',
  submittedByProfileId: 'child-1',
  submittedAt:          '2026-10-02T12:00:00.000Z',
  hasPhoto:             false,
};
const withPhotoContext: TaskCompletionReviewContext = { ...noPhotoContext, hasPhoto: true };

test('initialReviewState starts in loading_context and remembers the decision', () => {
  const s = initialReviewState('approve');
  assert.equal(s.phase, 'loading_context');
  assert.equal(s.decision, 'approve');
  assert.equal(s.context, null);
  assert.equal(s.evidenceUri, null);
  assert.equal(s.error, null);
});

test('loading_context does not allow confirming a decision', () => {
  assert.equal(canConfirmDecision(initialReviewState('approve')), false);
});

test('no-photo context transitions to ready_no_photo and allows confirmation (no evidence fetch required)', () => {
  const s = onContextLoaded(initialReviewState('approve'), noPhotoContext);
  assert.equal(s.phase, 'ready_no_photo');
  assert.equal(s.context?.hasPhoto, false);
  assert.equal(canConfirmDecision(s), true);
  // evidenceUri stays null — no fetch is ever issued for no-photo.
  assert.equal(s.evidenceUri, null);
});

test('photo-bearing context transitions to loading_evidence (NOT ready) — approve/reject disabled until evidence loads', () => {
  const s = onContextLoaded(initialReviewState('approve'), withPhotoContext);
  assert.equal(s.phase, 'loading_evidence');
  assert.equal(canConfirmDecision(s), false);
});

test('onEvidenceLoaded transitions to ready_with_photo with the file URI and allows confirmation', () => {
  const loading = onContextLoaded(initialReviewState('approve'), withPhotoContext);
  const ready   = onEvidenceLoaded(loading, 'file:///cache/review-evidence-a.png');
  assert.equal(ready.phase, 'ready_with_photo');
  assert.equal(ready.evidenceUri, 'file:///cache/review-evidence-a.png');
  assert.equal(canConfirmDecision(ready), true);
});

test('onEvidenceFailed disables confirmation and surfaces a safe error', () => {
  const loading = onContextLoaded(initialReviewState('approve'), withPhotoContext);
  const failed  = onEvidenceFailed(loading);
  assert.equal(failed.phase, 'evidence_failed');
  assert.deepEqual(failed.error, { kind: 'evidence_failed' });
  assert.equal(canConfirmDecision(failed), false);
});

test('onEvidenceRetry re-enters loading_evidence from evidence_failed with photo context', () => {
  const loading = onContextLoaded(initialReviewState('approve'), withPhotoContext);
  const failed  = onEvidenceFailed(loading);
  const retried = onEvidenceRetry(failed);
  assert.equal(retried.phase, 'loading_evidence');
  assert.equal(retried.error, null);
});

test('onEvidenceRetry is a no-op from other phases', () => {
  const s = initialReviewState('approve');
  assert.equal(onEvidenceRetry(s), s);
  const noPhoto = onContextLoaded(s, noPhotoContext);
  assert.equal(onEvidenceRetry(noPhoto), noPhoto);
});

test('onContextNotFound is terminal and non-confirmable', () => {
  const s = onContextNotFound(initialReviewState('approve'));
  assert.equal(s.phase, 'terminal_not_found');
  assert.deepEqual(s.error, { kind: 'not_found' });
  assert.equal(isTerminalPhase(s), true);
  assert.equal(canConfirmDecision(s), false);
});

test('onContextNotAuthorized is terminal and non-confirmable', () => {
  const s = onContextNotAuthorized(initialReviewState('approve'));
  assert.equal(s.phase, 'terminal_not_authorized');
  assert.equal(isTerminalPhase(s), true);
  assert.equal(canConfirmDecision(s), false);
});

test('onContextFailed behaves as evidence_failed (safe retryable) — not terminal', () => {
  const s = onContextFailed(initialReviewState('approve'));
  assert.equal(s.phase, 'evidence_failed');
  assert.deepEqual(s.error, { kind: 'context_failed' });
  assert.equal(isTerminalPhase(s), false);
  assert.equal(canConfirmDecision(s), false);
});

test('onBeginApprove is only allowed from ready_no_photo or ready_with_photo', () => {
  // Not allowed from loading_context.
  assert.equal(onBeginApprove(initialReviewState('approve')), null);
  // Not allowed from evidence_failed.
  const failed = onEvidenceFailed(onContextLoaded(initialReviewState('approve'), withPhotoContext));
  assert.equal(onBeginApprove(failed), null);
  // Allowed from ready_no_photo.
  const readyNo = onContextLoaded(initialReviewState('approve'), noPhotoContext);
  const beganNo = onBeginApprove(readyNo);
  assert.ok(beganNo); assert.equal(beganNo!.phase, 'approving');
  // Allowed from ready_with_photo.
  const readyWith = onEvidenceLoaded(onContextLoaded(initialReviewState('approve'), withPhotoContext), 'file:///cache/review-evidence-x.jpg');
  const beganWith = onBeginApprove(readyWith);
  assert.ok(beganWith); assert.equal(beganWith!.phase, 'approving');
});

test('onBeginReject follows the exact same gating as onBeginApprove', () => {
  assert.equal(onBeginReject(initialReviewState('reject')), null);
  const readyNo  = onContextLoaded(initialReviewState('reject'), noPhotoContext);
  assert.equal(onBeginReject(readyNo)!.phase, 'rejecting');
  const readyWith = onEvidenceLoaded(onContextLoaded(initialReviewState('reject'), withPhotoContext), 'file:///cache/review-evidence-x.jpg');
  assert.equal(onBeginReject(readyWith)!.phase, 'rejecting');
});

test('double-action is prevented logically: begin-approve from `approving` returns null', () => {
  const ready    = onContextLoaded(initialReviewState('approve'), noPhotoContext);
  const approving = onBeginApprove(ready)!;
  assert.equal(onBeginApprove(approving), null);
  assert.equal(onBeginReject(approving),  null);
});

test('onActionFailed retains the context and evidenceUri so the reviewer can retry', () => {
  const ready    = onEvidenceLoaded(onContextLoaded(initialReviewState('approve'), withPhotoContext), 'file:///cache/review-evidence-z.png');
  const approving = onBeginApprove(ready)!;
  const failed   = onActionFailed(approving);
  assert.equal(failed.phase, 'action_failed');
  assert.equal(failed.context?.submissionId, 'sub-1');
  assert.equal(failed.evidenceUri, 'file:///cache/review-evidence-z.png');
  // Not terminal.
  assert.equal(isTerminalPhase(failed), false);
  // Can retry via onReturnToReady → ready_with_photo.
  const retried = onReturnToReady(failed);
  assert.equal(retried.phase, 'ready_with_photo');
  assert.equal(canConfirmDecision(retried), true);
});

test('onActionFailed on a no-photo context returns to ready_no_photo via onReturnToReady', () => {
  const ready    = onContextLoaded(initialReviewState('reject'), noPhotoContext);
  const rejecting = onBeginReject(ready)!;
  const failed   = onActionFailed(rejecting);
  const retried  = onReturnToReady(failed);
  assert.equal(retried.phase, 'ready_no_photo');
});

test('onActionNotPending is terminal and non-confirmable (CH017 — submission already reviewed)', () => {
  const ready = onEvidenceLoaded(onContextLoaded(initialReviewState('approve'), withPhotoContext), 'file:///cache/review-evidence-x.jpg');
  const started = onBeginApprove(ready)!;
  const terminal = onActionNotPending(started);
  assert.equal(terminal.phase, 'terminal_not_pending');
  assert.equal(isTerminalPhase(terminal), true);
  assert.equal(canConfirmDecision(terminal), false);
});

test('onActionNotAuthorized is terminal and non-confirmable (28000)', () => {
  const ready = onContextLoaded(initialReviewState('reject'), noPhotoContext);
  const started = onBeginReject(ready)!;
  const terminal = onActionNotAuthorized(started);
  assert.equal(terminal.phase, 'terminal_not_authorized');
  assert.equal(isTerminalPhase(terminal), true);
  assert.equal(canConfirmDecision(terminal), false);
});

test('photo evidence is required: a photo-bearing submission whose evidence failed cannot approve/reject', () => {
  const loading = onContextLoaded(initialReviewState('approve'), withPhotoContext);
  const failed  = onEvidenceFailed(loading);
  // Hard product rule — the directive's "PHOTO EXISTS + PHOTO FAILED = NO APPROVE / REJECT".
  assert.equal(canConfirmDecision(failed), false);
  assert.equal(onBeginApprove(failed), null);
  assert.equal(onBeginReject(failed),  null);
});

test('the evidence file URI stays on the state object — no Storage path leaks into the UI-facing state', () => {
  // The TaskCompletionReviewContext type (and this state's `context` slot)
  // intentionally has no photo_storage_path field — only hasPhoto. Nothing
  // in the state machine ever sets a `photo_storage_path` field, so an
  // adversarial consumer cannot find it on the UI-facing state.
  const ready = onEvidenceLoaded(onContextLoaded(initialReviewState('approve'), withPhotoContext), 'file:///cache/review-evidence-b.png');
  const asJson = JSON.stringify(ready);
  assert.equal(asJson.includes('photo_storage_path'), false);
  assert.equal(asJson.includes('storage/v1'),         false);
  assert.equal(asJson.includes('/storage/'),          false);
});

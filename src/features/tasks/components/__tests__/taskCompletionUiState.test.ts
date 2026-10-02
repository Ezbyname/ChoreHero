import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_UI_STATE,
  isTerminalPhase,
  onBeginNoPhotoSubmit,
  onBeginPhotoSubmit,
  onCameraPermissionDenied,
  onLocalPhotoReadFailed,
  onPhotoRemoved,
  onPhotoSelected,
  onPickerCancelled,
  onPickerFailed,
  onSubmitInvalidMime,
  onSubmitRetryableFailed,
  onSubmitSuccess,
  onSubmitTerminalNotAuthorized,
  onSubmitTerminalNotOpen,
  onSubmitUncertain,
  onSubmitUnexpectedFailure,
  type TaskCompletionUiState,
} from '@/features/tasks/components/taskCompletionUiState';

// Deterministic UUID generator for tests — each call returns a unique
// predictable string so identity comparisons across transitions are easy
// to read.
function makeIdGen() {
  let n = 0;
  return () => `uuid-${++n}`;
}

const samplePhoto = { previewUri: 'file:///tmp/photo.png', mimeType: 'image/png' };

test('INITIAL_UI_STATE has no attempt and idle phase (opening the Modal does not mint an attempt)', () => {
  assert.equal(INITIAL_UI_STATE.photo, null);
  assert.equal(INITIAL_UI_STATE.attempt, null);
  assert.equal(INITIAL_UI_STATE.phase, 'idle');
  assert.equal(INITIAL_UI_STATE.error, null);
});

test('onPickerCancelled is a no-op (picker cancel never creates an attempt)', () => {
  const next = onPickerCancelled(INITIAL_UI_STATE);
  assert.equal(next, INITIAL_UI_STATE);
  assert.equal(next.attempt, null);
});

test('onCameraPermissionDenied records error but does NOT mint an attempt', () => {
  const next = onCameraPermissionDenied(INITIAL_UI_STATE);
  assert.equal(next.attempt, null);
  assert.equal(next.photo, null);
  assert.deepEqual(next.error, { kind: 'camera_permission_denied' });
});

test('onPhotoSelected creates a fresh photo-bearing attempt with new clientRequestId and photoObjectId', () => {
  const gen = makeIdGen();
  const next = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  assert.ok(next.attempt, 'attempt must exist after photo selection');
  assert.equal(next.attempt!.clientRequestId, 'uuid-1');
  assert.equal(next.attempt!.photoObjectId, 'uuid-2');
  assert.equal(next.attempt!.evidenceUploadState, 'not_uploaded');
  assert.equal(next.phase, 'photo_selected');
  assert.equal(next.error, null);
  assert.deepEqual(next.photo, samplePhoto);
});

test('onPhotoSelected again (replace) creates a NEW attempt with DIFFERENT clientRequestId AND DIFFERENT photoObjectId', () => {
  const gen = makeIdGen();
  const first = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const second = onPhotoSelected(first, { previewUri: 'file:///tmp/other.jpg', mimeType: 'image/jpeg' }, gen);
  assert.notEqual(second.attempt!.clientRequestId, first.attempt!.clientRequestId);
  assert.notEqual(second.attempt!.photoObjectId, first.attempt!.photoObjectId);
  assert.equal(second.attempt!.evidenceUploadState, 'not_uploaded');
});

test('onPhotoRemoved creates a NEW no-photo attempt (fresh clientRequestId, photoObjectId=null)', () => {
  const gen = makeIdGen();
  const withPhoto = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const removed = onPhotoRemoved(withPhoto, gen);
  assert.equal(removed.photo, null);
  assert.ok(removed.attempt);
  assert.notEqual(removed.attempt!.clientRequestId, withPhoto.attempt!.clientRequestId);
  assert.equal(removed.attempt!.photoObjectId, null);
  assert.equal(removed.attempt!.evidenceUploadState, 'confirmed');
  assert.equal(removed.phase, 'idle');
});

test('onBeginNoPhotoSubmit mints a fresh no-photo attempt when none exists', () => {
  const gen = makeIdGen();
  const next = onBeginNoPhotoSubmit(INITIAL_UI_STATE, gen);
  assert.ok(next.attempt);
  assert.equal(next.attempt!.clientRequestId, 'uuid-1');
  assert.equal(next.attempt!.photoObjectId, null);
  assert.equal(next.attempt!.evidenceUploadState, 'confirmed');
  assert.equal(next.phase, 'submitting');
});

test('onBeginNoPhotoSubmit reuses an existing no-photo attempt (idempotent for retry identity)', () => {
  const gen = makeIdGen();
  const withNoPhotoAttempt = onPhotoRemoved(
    onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen),
    gen,
  );
  const existing = withNoPhotoAttempt.attempt!;
  const begun = onBeginNoPhotoSubmit(withNoPhotoAttempt, gen);
  assert.equal(begun.attempt!.clientRequestId, existing.clientRequestId);
  assert.equal(begun.attempt!.photoObjectId, null);
  assert.equal(begun.phase, 'submitting');
});

test('onBeginPhotoSubmit does NOT mint a new attempt (retry identity preserved)', () => {
  const gen = makeIdGen();
  const withPhoto = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const original = withPhoto.attempt!;
  const begun = onBeginPhotoSubmit(withPhoto);
  assert.ok(begun);
  assert.equal(begun!.attempt!.clientRequestId, original.clientRequestId);
  assert.equal(begun!.attempt!.photoObjectId, original.photoObjectId);
  assert.equal(begun!.phase, 'submitting');
});

test('onBeginPhotoSubmit returns null when the state has no photo or no attempt (defensive)', () => {
  assert.equal(onBeginPhotoSubmit(INITIAL_UI_STATE), null);
});

test('onSubmitUncertain preserves the returned attempt verbatim (ids intact, evidenceUploadState from orchestration)', () => {
  const gen = makeIdGen();
  const withPhoto = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const returnedState = {
    clientRequestId:     withPhoto.attempt!.clientRequestId,
    photoObjectId:       withPhoto.attempt!.photoObjectId,
    evidenceUploadState: 'uncertain' as const,
  };
  const next = onSubmitUncertain(withPhoto, returnedState);
  assert.equal(next.attempt!.clientRequestId, withPhoto.attempt!.clientRequestId);
  assert.equal(next.attempt!.photoObjectId, withPhoto.attempt!.photoObjectId);
  assert.equal(next.attempt!.evidenceUploadState, 'uncertain');
  assert.equal(next.phase, 'retryable_uncertain');
  assert.deepEqual(next.error, { kind: 'network_uncertain' });
});

test('onSubmitRetryableFailed preserves the returned attempt (ids intact)', () => {
  const gen = makeIdGen();
  const withPhoto = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const returnedState = withPhoto.attempt!;
  const next = onSubmitRetryableFailed(withPhoto, returnedState);
  assert.equal(next.attempt!.clientRequestId, returnedState.clientRequestId);
  assert.equal(next.attempt!.photoObjectId, returnedState.photoObjectId);
  assert.equal(next.phase, 'retryable_failed');
});

test('onSubmitInvalidMime surfaces validation error, state otherwise preserved', () => {
  const next = onSubmitInvalidMime(INITIAL_UI_STATE);
  assert.equal(next.phase, 'validation_error');
  assert.deepEqual(next.error, { kind: 'invalid_mime' });
});

test('onSubmitTerminalNotOpen clears attempt and surfaces terminal error', () => {
  const gen = makeIdGen();
  const withPhoto = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const next = onSubmitTerminalNotOpen(withPhoto);
  assert.equal(next.attempt, null);
  assert.equal(next.phase, 'validation_error');
  assert.deepEqual(next.error, { kind: 'not_open' });
});

test('onSubmitTerminalNotAuthorized clears attempt and surfaces terminal error', () => {
  const gen = makeIdGen();
  const withPhoto = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const next = onSubmitTerminalNotAuthorized(withPhoto);
  assert.equal(next.attempt, null);
  assert.equal(next.phase, 'validation_error');
  assert.deepEqual(next.error, { kind: 'not_authorized' });
});

test('onSubmitSuccess resets to the initial state so the modal can close cleanly', () => {
  const gen = makeIdGen();
  const withPhoto = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const next = onSubmitSuccess(withPhoto);
  assert.deepEqual(next, INITIAL_UI_STATE);
});

test('full flow — select, submit uncertain, retry preserves same ids (correction 1 invariant)', () => {
  // This mirrors the live QA-03 identity invariant at the UI boundary:
  // network retry (uncertain → retry) must preserve clientRequestId AND
  // photoObjectId. No pure-state transition in this module ever mints
  // new ids after `onSubmitUncertain`, so a direct retry call sequence
  // through this module naturally re-uses them.
  const gen = makeIdGen();
  const selected = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const originalCri   = selected.attempt!.clientRequestId;
  const originalPhoto = selected.attempt!.photoObjectId;

  const submitting = onBeginPhotoSubmit(selected)!;
  const uncertain  = onSubmitUncertain(submitting, submitting.attempt);

  // Caller retries by calling onBeginPhotoSubmit again on the uncertain
  // state. Attempt ids must still match the originals.
  const resumitting = onBeginPhotoSubmit({
    ...uncertain,
    photo: samplePhoto,
  })!;
  assert.equal(resumitting.attempt!.clientRequestId, originalCri);
  assert.equal(resumitting.attempt!.photoObjectId, originalPhoto);
});

test('full flow — replace during retryable state mints NEW ids (user-changes-payload invariant)', () => {
  const gen = makeIdGen();
  const selected  = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const submitting = onBeginPhotoSubmit(selected)!;
  const failed    = onSubmitRetryableFailed(submitting, submitting.attempt);

  const replaced = onPhotoSelected(failed, { previewUri: 'file:///tmp/new.webp', mimeType: 'image/webp' }, gen);
  assert.notEqual(replaced.attempt!.clientRequestId, selected.attempt!.clientRequestId);
  assert.notEqual(replaced.attempt!.photoObjectId, selected.attempt!.photoObjectId);
});

// ─── P1 Correction pass additions ────────────────────────────────────────

test('onPickerFailed from initial state keeps attempt null and records a safe error (no submission)', () => {
  const next = onPickerFailed(INITIAL_UI_STATE);
  assert.equal(next.attempt, null);
  assert.equal(next.photo, null);
  assert.deepEqual(next.error, { kind: 'picker_failed' });
  // Phase must not become 'submitting' from a picker failure.
  assert.notEqual(next.phase, 'submitting');
});

test('onPickerFailed during replacement preserves the previous photo, attempt, and both ids verbatim', () => {
  const gen = makeIdGen();
  const original = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  // Simulate user tapping "Take another photo" and the picker throwing:
  // the Modal routes to onPickerFailed on the current state (which still
  // holds the original photo + attempt). No new attempt is minted.
  const afterFailure = onPickerFailed(original);
  assert.deepEqual(afterFailure.photo, original.photo);
  assert.equal(afterFailure.attempt!.clientRequestId, original.attempt!.clientRequestId);
  assert.equal(afterFailure.attempt!.photoObjectId, original.attempt!.photoObjectId);
  assert.deepEqual(afterFailure.error, { kind: 'picker_failed' });
});

test('onSubmitUnexpectedFailure exits submitting, preserves attempt + ids, child can retry (no new attempt minted)', () => {
  const gen = makeIdGen();
  const selected   = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const submitting = onBeginPhotoSubmit(selected)!;
  assert.equal(submitting.phase, 'submitting');

  const unexpected = onSubmitUnexpectedFailure(submitting);
  assert.notEqual(unexpected.phase, 'submitting');
  assert.equal(unexpected.phase, 'retryable_failed');
  assert.equal(unexpected.attempt!.clientRequestId, selected.attempt!.clientRequestId);
  assert.equal(unexpected.attempt!.photoObjectId, selected.attempt!.photoObjectId);
  assert.deepEqual(unexpected.photo, selected.photo);
  assert.deepEqual(unexpected.error, { kind: 'unexpected_failure' });

  // A plain retry on the same state goes back through onBeginPhotoSubmit
  // and MUST NOT mint new ids.
  const retried = onBeginPhotoSubmit(unexpected)!;
  assert.equal(retried.attempt!.clientRequestId, selected.attempt!.clientRequestId);
  assert.equal(retried.attempt!.photoObjectId, selected.attempt!.photoObjectId);
});

test('onLocalPhotoReadFailed preserves selected photo and logical attempt (retryable)', () => {
  const gen = makeIdGen();
  const selected   = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const submitting = onBeginPhotoSubmit(selected)!;

  const read = onLocalPhotoReadFailed(submitting);
  assert.notEqual(read.phase, 'submitting');
  assert.equal(read.phase, 'retryable_failed');
  assert.equal(read.attempt!.clientRequestId, selected.attempt!.clientRequestId);
  assert.equal(read.attempt!.photoObjectId, selected.attempt!.photoObjectId);
  assert.deepEqual(read.photo, selected.photo);
  assert.deepEqual(read.error, { kind: 'photo_read_failed' });
});

test('isTerminalPhase is true for not_open and not_authorized, false for retryable / idle / submitting', () => {
  const gen = makeIdGen();
  const selected = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  assert.equal(isTerminalPhase(onSubmitTerminalNotOpen(selected)), true);
  assert.equal(isTerminalPhase(onSubmitTerminalNotAuthorized(selected)), true);
  assert.equal(isTerminalPhase(INITIAL_UI_STATE), false);
  assert.equal(isTerminalPhase(selected), false);
  assert.equal(isTerminalPhase(onBeginPhotoSubmit(selected)!), false);
  assert.equal(isTerminalPhase(onSubmitUncertain(selected, selected.attempt)), false);
  assert.equal(isTerminalPhase(onSubmitRetryableFailed(selected, selected.attempt)), false);
  assert.equal(isTerminalPhase(onSubmitUnexpectedFailure(selected)), false);
  // invalid_mime is also a 'validation_error' phase but with a non-terminal
  // kind, so the child may retry with another photo. Must NOT be terminal.
  assert.equal(isTerminalPhase(onSubmitInvalidMime(selected)), false);
});

test('successful Camera replacement mints a NEW clientRequestId AND photoObjectId (both)', () => {
  // Modal routes both camera and gallery replacements through onPhotoSelected,
  // so this invariant is identical for both sources — asserted once per source.
  const gen = makeIdGen();
  const first = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const cameraReplacement = onPhotoSelected(
    first,
    { previewUri: 'file:///tmp/camera-capture.jpg', mimeType: 'image/jpeg' },
    gen,
  );
  assert.notEqual(cameraReplacement.attempt!.clientRequestId, first.attempt!.clientRequestId);
  assert.notEqual(cameraReplacement.attempt!.photoObjectId, first.attempt!.photoObjectId);
  assert.equal(cameraReplacement.attempt!.evidenceUploadState, 'not_uploaded');
});

test('successful Gallery replacement mints a NEW clientRequestId AND photoObjectId (both)', () => {
  const gen = makeIdGen();
  const first = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const galleryReplacement = onPhotoSelected(
    first,
    { previewUri: 'file:///tmp/gallery-pick.webp', mimeType: 'image/webp' },
    gen,
  );
  assert.notEqual(galleryReplacement.attempt!.clientRequestId, first.attempt!.clientRequestId);
  assert.notEqual(galleryReplacement.attempt!.photoObjectId, first.attempt!.photoObjectId);
});

test('terminal not_open cannot be followed by onBeginPhotoSubmit minting a fresh attempt (defensive)', () => {
  const gen = makeIdGen();
  const selected = onPhotoSelected(INITIAL_UI_STATE, samplePhoto, gen);
  const terminal = onSubmitTerminalNotOpen(selected);
  // Terminal state has attempt=null, so onBeginPhotoSubmit returns null —
  // the Modal's actionsDisabled gate also prevents the user ever reaching
  // this call. Belt + braces: both the state module and the Modal refuse.
  assert.equal(terminal.attempt, null);
  assert.equal(onBeginPhotoSubmit(terminal), null);
});

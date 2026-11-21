import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_UI_STATE,
  MAX_EVIDENCE_PHOTOS,
  canAddPhotos,
  canSubmit,
  isTerminalPhase,
  onBeginSubmit,
  onCameraPermissionDenied,
  onLocalPhotoReadFailed,
  onPhotoRemovedAt,
  onPhotoReplacedAt,
  onPhotosAdded,
  onPickerCancelled,
  onPickerFailed,
  onSubmitInvalidMime,
  onSubmitProgress,
  onSubmitRetryableFailed,
  onSubmitSuccess,
  onSubmitTerminalNotAuthorized,
  onSubmitTerminalNotOpen,
  onSubmitUncertain,
  onSubmitUnexpectedFailure,
  photoCountLabel,
  remainingPhotoSlots,
  type SelectedPhoto,
  type TaskCompletionUiState,
} from '@/features/tasks/components/taskCompletionUiState';

// Deterministic id generator — every call returns a new predictable id so
// identity comparisons across transitions are easy to read.
function makeIdGen() {
  let n = 0;
  return () => `uuid-${++n}`;
}

const cam = (n: number): SelectedPhoto => ({ previewUri: `file:///camera-${n}.jpg`, mimeType: 'image/jpeg', source: 'camera' });
const gal = (n: number): SelectedPhoto => ({ previewUri: `file:///gallery-${n}.png`, mimeType: 'image/png', source: 'gallery' });

function allIds(s: TaskCompletionUiState): string[] {
  return s.attempt ? [s.attempt.clientRequestId, ...s.attempt.photos.map((p) => p.photoObjectId)] : [];
}

// ── Lazy attempt creation ───────────────────────────────────────────────────

test('opening the Modal mints no attempt; picker cancel / permission denial / picker failure mint none', () => {
  assert.equal(INITIAL_UI_STATE.attempt, null);
  assert.deepEqual(INITIAL_UI_STATE.photos, []);
  assert.equal(onPickerCancelled(INITIAL_UI_STATE), INITIAL_UI_STATE);
  assert.equal(onPhotosAdded(INITIAL_UI_STATE, [], makeIdGen()), INITIAL_UI_STATE);
  assert.equal(onCameraPermissionDenied(INITIAL_UI_STATE).attempt, null);
  assert.equal(onCameraPermissionDenied(INITIAL_UI_STATE).error?.kind, 'camera_permission_denied');
  assert.equal(onPickerFailed(INITIAL_UI_STATE).attempt, null);
  assert.equal(onPickerFailed(INITIAL_UI_STATE).error?.kind, 'picker_failed');
});

// ── 0 / 1 / 5 / 6th photo ───────────────────────────────────────────────────

test('0 photos: Submit is available and mints a fresh no-photo attempt lazily', () => {
  assert.equal(canSubmit(INITIAL_UI_STATE), true);
  const working = onBeginSubmit(INITIAL_UI_STATE, makeIdGen());
  assert.equal(working.phase, 'submitting');
  assert.deepEqual(working.attempt, { clientRequestId: 'uuid-1', photos: [] });
  assert.equal(canSubmit(working), false); // double tap blocked while in flight
});

test('1 photo: one fresh attempt (clientRequestId + one photoObjectId), count label 1 / 5', () => {
  const s = onPhotosAdded(INITIAL_UI_STATE, [cam(1)], makeIdGen());
  assert.equal(s.phase, 'ready');
  assert.equal(s.photos.length, 1);
  assert.deepEqual(s.attempt, { clientRequestId: 'uuid-1', photos: [{ photoObjectId: 'uuid-2', evidenceUploadState: 'not_uploaded' }] });
  assert.equal(photoCountLabel(s), '1 / 5');
  assert.equal(canSubmit(s), true);
});

test('5 photos (mixed Camera + Gallery): all accepted in order, one id per photo, no more room', () => {
  const gen = makeIdGen();
  let s = onPhotosAdded(INITIAL_UI_STATE, [cam(1)], gen);
  s = onPhotosAdded(s, [gal(1), gal(2)], gen);
  s = onPhotosAdded(s, [cam(2)], gen);
  s = onPhotosAdded(s, [gal(3)], gen);
  assert.equal(MAX_EVIDENCE_PHOTOS, 5);
  assert.deepEqual(s.photos.map((p) => p.source), ['camera', 'gallery', 'gallery', 'camera', 'gallery']);
  assert.equal(s.attempt?.photos.length, 5);
  assert.equal(new Set(allIds(s)).size, 6);
  assert.equal(photoCountLabel(s), '5 / 5');
  assert.equal(remainingPhotoSlots(s), 0);
  assert.equal(canAddPhotos(s), false);
  assert.equal(canSubmit(s), true);
});

test('a 6th photo is refused with a visible error; the 5-photo selection and its attempt are untouched', () => {
  const gen = makeIdGen();
  const five = onPhotosAdded(INITIAL_UI_STATE, [cam(1), cam(2), gal(1), gal(2), cam(3)], gen);
  const six  = onPhotosAdded(five, [gal(9)], gen);
  assert.equal(six.photos.length, 5);
  assert.equal(six.attempt, five.attempt);
  assert.equal(six.error?.kind, 'too_many_photos');
});

test('a gallery multi-select larger than the room left keeps the first ones and reports the rest', () => {
  const gen = makeIdGen();
  const s = onPhotosAdded(onPhotosAdded(INITIAL_UI_STATE, [cam(1), cam(2), cam(3)], gen), [gal(1), gal(2), gal(3)], gen);
  assert.deepEqual(s.photos.map((p) => p.previewUri), ['file:///camera-1.jpg', 'file:///camera-2.jpg', 'file:///camera-3.jpg', 'file:///gallery-1.png', 'file:///gallery-2.png']);
  assert.equal(s.error?.kind, 'too_many_photos');
  assert.equal(s.attempt?.photos.length, 5);
});

// ── Changing the set is always a NEW logical attempt ────────────────────────

test('adding, replacing or removing a photo mints NEW ids for the whole set (never reuses old ones)', () => {
  const gen = makeIdGen();
  const one     = onPhotosAdded(INITIAL_UI_STATE, [cam(1)], gen);
  const two     = onPhotosAdded(one, [gal(1)], gen);
  const replace = onPhotoReplacedAt(two, 0, cam(7), gen);
  const removed = onPhotoRemovedAt(replace, 1, gen);
  const seen = new Set<string>();
  for (const s of [one, two, replace, removed]) for (const id of allIds(s)) {
    assert.ok(!seen.has(id), `id ${id} reused`);
    seen.add(id);
  }
  assert.deepEqual(replace.photos.map((p) => p.previewUri), ['file:///camera-7.jpg', 'file:///gallery-1.png']);
  assert.deepEqual(removed.photos.map((p) => p.previewUri), ['file:///camera-7.jpg']);
});

test('removing the last photo leaves a fresh no-photo attempt (old single-photo Remove semantics)', () => {
  const gen = makeIdGen();
  const s = onPhotoRemovedAt(onPhotosAdded(INITIAL_UI_STATE, [cam(1)], gen), 0, gen);
  assert.deepEqual(s.photos, []);
  assert.equal(s.phase, 'idle');
  assert.equal(s.attempt?.photos.length, 0);
  assert.notEqual(s.attempt?.clientRequestId, 'uuid-1');
  // Submit reuses that no-photo attempt rather than minting another.
  assert.equal(onBeginSubmit(s, () => 'never').attempt, s.attempt);
});

test('out-of-range replace / remove are no-ops', () => {
  const s = onPhotosAdded(INITIAL_UI_STATE, [cam(1)], makeIdGen());
  assert.equal(onPhotoRemovedAt(s, 3, makeIdGen()), s);
  assert.equal(onPhotoReplacedAt(s, -1, gal(1), makeIdGen()), s);
});

// ── Retry / idempotency ─────────────────────────────────────────────────────

test('Submit with photos reuses the attempt minted at selection (retry identity preserved)', () => {
  const s = onPhotosAdded(INITIAL_UI_STATE, [cam(1), gal(1)], makeIdGen());
  const working = onBeginSubmit(s, () => 'MUST-NOT-BE-USED');
  assert.equal(working.attempt, s.attempt);
  assert.equal(working.phase, 'submitting');
  assert.ok(!allIds(working).includes('MUST-NOT-BE-USED'));
});

test('uncertain / retryable failures keep the returned attempt verbatim; the next Submit reuses every id', () => {
  const gen = makeIdGen();
  const s = onPhotosAdded(INITIAL_UI_STATE, [cam(1), gal(1), gal(2)], gen);
  const working = onBeginSubmit(s, gen);
  const returned = {
    clientRequestId: s.attempt!.clientRequestId,
    photos: s.attempt!.photos.map((p, i) => ({ ...p, evidenceUploadState: i === 0 ? 'confirmed' as const : 'uncertain' as const })),
  };
  const unc = onSubmitUncertain(working, returned);
  assert.equal(unc.phase, 'retryable_uncertain');
  assert.equal(unc.error?.kind, 'network_uncertain');
  assert.equal(unc.attempt, returned);
  const retry = onBeginSubmit(unc, () => 'MUST-NOT-BE-USED');
  assert.deepEqual(allIds(retry), allIds(s));

  const failed = onSubmitRetryableFailed(working, returned);
  assert.equal(failed.phase, 'retryable_failed');
  assert.equal(failed.attempt, returned);
});

test('a terminal rejection of the attempt (null) shows attempt_rejected and blocks Submit until the set changes', () => {
  const gen = makeIdGen();
  const s = onPhotosAdded(INITIAL_UI_STATE, [cam(1), cam(2)], gen);
  const rejected = onSubmitRetryableFailed(onBeginSubmit(s, gen), null);
  assert.equal(rejected.error?.kind, 'attempt_rejected');
  assert.equal(rejected.attempt, null);
  assert.equal(canSubmit(rejected), false);
  assert.equal(onBeginSubmit(rejected, gen).error?.kind, 'attempt_rejected');
  // Recovery: change the set -> brand-new attempt.
  const recovered = onPhotoRemovedAt(rejected, 1, gen);
  assert.equal(canSubmit(recovered), true);
});

test('progress is shown only while submitting', () => {
  const s = onPhotosAdded(INITIAL_UI_STATE, [cam(1), cam(2)], makeIdGen());
  assert.equal(onSubmitProgress(s, { current: 1, total: 2 }), s);
  const w = onSubmitProgress(onBeginSubmit(s, makeIdGen()), { current: 2, total: 2 });
  assert.deepEqual(w.progress, { current: 2, total: 2 });
  assert.equal(onSubmitUncertain(w, w.attempt).progress, null);
});

// ── Terminal / error transitions ────────────────────────────────────────────

test('not_open / not_authorized are terminal: attempt cleared, Submit and Add disabled', () => {
  const s = onPhotosAdded(INITIAL_UI_STATE, [cam(1)], makeIdGen());
  for (const t of [onSubmitTerminalNotOpen(s), onSubmitTerminalNotAuthorized(s)]) {
    assert.equal(t.attempt, null);
    assert.equal(isTerminalPhase(t), true);
    assert.equal(canSubmit(t), false);
    assert.equal(canAddPhotos(t), false);
  }
  assert.equal(isTerminalPhase(s), false);
  assert.equal(isTerminalPhase(onSubmitRetryableFailed(s, s.attempt)), false);
});

test('unexpected failure / local read failure / invalid mime: never stuck submitting, photos + ids kept', () => {
  const s = onPhotosAdded(INITIAL_UI_STATE, [cam(1), gal(1)], makeIdGen());
  const w = onBeginSubmit(s, makeIdGen());
  for (const [next, kind] of [
    [onSubmitUnexpectedFailure(w), 'unexpected_failure'],
    [onLocalPhotoReadFailed(w), 'photo_read_failed'],
    [onSubmitInvalidMime(w), 'invalid_mime'],
  ] as const) {
    assert.notEqual(next.phase, 'submitting');
    assert.equal(next.error?.kind, kind);
    assert.equal(next.photos, s.photos);
    assert.deepEqual(allIds(next), allIds(s));
  }
});

test('success resets to the initial state so the modal can close cleanly', () => {
  const s = onPhotosAdded(INITIAL_UI_STATE, [cam(1)], makeIdGen());
  assert.deepEqual(onSubmitSuccess(onBeginSubmit(s, makeIdGen())), INITIAL_UI_STATE);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageApiError } from '@supabase/supabase-js';

import {
  ALLOWED_EVIDENCE_MIME_TYPES,
  buildTaskCompletionEvidencePath,
  classifyAndApplyUploadResult,
  classifyRpcError,
  isVerifiedDuplicateUploadError,
  onCh015,
  onPhotoChanged,
  startNewAttempt,
  validateEvidenceMimeType,
} from '@/features/tasks/taskCompletionAttempt';

// ── startNewAttempt / onPhotoChanged ──────────────────────────────────────

test('startNewAttempt mints both ids for a photo-bearing attempt, starting not_uploaded', () => {
  const ids = ['cri-1', 'photo-1'];
  let i = 0;
  const state = startNewAttempt(true, () => ids[i++]);
  assert.equal(state.clientRequestId, 'cri-1');
  assert.equal(state.photoObjectId, 'photo-1');
  assert.equal(state.evidenceUploadState, 'not_uploaded');
  assert.equal(i, 2);
});

test('startNewAttempt mints only a clientRequestId for a no-photo attempt, starting confirmed', () => {
  let calls = 0;
  const state = startNewAttempt(false, () => {
    calls += 1;
    return 'cri-only';
  });
  assert.equal(state.clientRequestId, 'cri-only');
  assert.equal(state.photoObjectId, null);
  assert.equal(state.evidenceUploadState, 'confirmed');
  assert.equal(calls, 1);
});

test('onPhotoChanged always mints a fresh clientRequestId and photoObjectId, distinct from the prior attempt', () => {
  const ids = ['cri-1', 'photo-1', 'cri-2', 'photo-2'];
  let i = 0;
  const generate = () => ids[i++];

  const before = startNewAttempt(true, generate);
  const after  = onPhotoChanged(true, generate);

  assert.notEqual(after.clientRequestId, before.clientRequestId);
  assert.notEqual(after.photoObjectId, before.photoObjectId);
  assert.equal(after.clientRequestId, 'cri-2');
  assert.equal(after.photoObjectId, 'photo-2');
  assert.equal(after.evidenceUploadState, 'not_uploaded');
});

test('onPhotoChanged with hasPhoto=false (photo removed) mints a fresh id and clears photoObjectId, starting confirmed', () => {
  const ids = ['cri-1', 'photo-1', 'cri-2'];
  let i = 0;
  const generate = () => ids[i++];

  const before = startNewAttempt(true, generate);
  const after  = onPhotoChanged(false, generate);

  assert.notEqual(after.clientRequestId, before.clientRequestId);
  assert.equal(after.photoObjectId, null);
  assert.equal(after.evidenceUploadState, 'confirmed');
});

// ── isVerifiedDuplicateUploadError ────────────────────────────────────────

test('isVerifiedDuplicateUploadError is true only for the exact QA-verified shape (status 400, statusCode "409")', () => {
  assert.equal(
    isVerifiedDuplicateUploadError(new StorageApiError('Duplicate', 400, '409')),
    true,
  );
});

test('isVerifiedDuplicateUploadError is false for statusCode "409" alone with a different status', () => {
  assert.equal(
    isVerifiedDuplicateUploadError(new StorageApiError('Conflict', 409, '409')),
    false,
  );
});

test('isVerifiedDuplicateUploadError is false for a different non-duplicate 4xx', () => {
  assert.equal(
    isVerifiedDuplicateUploadError(new StorageApiError('Bad Request', 400, '400')),
    false,
  );
});

test('isVerifiedDuplicateUploadError is false for a 5xx', () => {
  assert.equal(
    isVerifiedDuplicateUploadError(new StorageApiError('Internal Error', 500, '500')),
    false,
  );
});

test('isVerifiedDuplicateUploadError is false for a non-StorageApiError value (the ambiguous/no-response case)', () => {
  assert.equal(isVerifiedDuplicateUploadError(new Error('fetch failed')), false);
  assert.equal(isVerifiedDuplicateUploadError(null), false);
  assert.equal(isVerifiedDuplicateUploadError(undefined), false);
});

// ── classifyAndApplyUploadResult ──────────────────────────────────────────

function attempt(evidenceUploadState: 'not_uploaded' | 'confirmed' | 'uncertain' = 'not_uploaded') {
  return { clientRequestId: 'cri-1', photoObjectId: 'photo-1', evidenceUploadState };
}

test('classifyAndApplyUploadResult: null error (2xx) -> confirmed', () => {
  const result = classifyAndApplyUploadResult(attempt(), null);
  assert.equal(result.kind, 'confirmed');
  assert.equal(result.state?.evidenceUploadState, 'confirmed');
  assert.equal(result.state?.clientRequestId, 'cri-1');
  assert.equal(result.state?.photoObjectId, 'photo-1');
});

test('classifyAndApplyUploadResult: verified duplicate -> confirmed', () => {
  const result = classifyAndApplyUploadResult(attempt(), new StorageApiError('Duplicate', 400, '409'));
  assert.equal(result.kind, 'confirmed');
  assert.equal(result.state?.evidenceUploadState, 'confirmed');
});

test('classifyAndApplyUploadResult: PGRST_NOT_CONFIGURED -> not_configured, state unchanged (not uncertain)', () => {
  const before = attempt('not_uploaded');
  const result = classifyAndApplyUploadResult(before, { code: 'PGRST_NOT_CONFIGURED', message: 'x', details: '', hint: '' });
  assert.equal(result.kind, 'not_configured');
  assert.deepEqual(result.state, before);
});

test('classifyAndApplyUploadResult: non-duplicate 4xx -> uncertain (not a terminal/no-orphan classification)', () => {
  const result = classifyAndApplyUploadResult(attempt(), new StorageApiError('Bad Request', 400, '400'));
  assert.equal(result.kind, 'uncertain');
  assert.equal(result.state?.evidenceUploadState, 'uncertain');
});

test('classifyAndApplyUploadResult: 5xx -> uncertain', () => {
  const result = classifyAndApplyUploadResult(attempt(), new StorageApiError('Internal Error', 500, '500'));
  assert.equal(result.kind, 'uncertain');
});

test('classifyAndApplyUploadResult: no-HTTP-response error -> uncertain', () => {
  const result = classifyAndApplyUploadResult(attempt(), new Error('fetch failed'));
  assert.equal(result.kind, 'uncertain');
});

test('classifyAndApplyUploadResult never changes clientRequestId/photoObjectId, for any outcome', () => {
  const before = attempt();
  for (const error of [
    null,
    new StorageApiError('Duplicate', 400, '409'),
    new StorageApiError('Bad Request', 400, '400'),
    new StorageApiError('Internal Error', 500, '500'),
    new Error('fetch failed'),
    { code: 'PGRST_NOT_CONFIGURED', message: 'x', details: '', hint: '' },
  ]) {
    const result = classifyAndApplyUploadResult(before, error);
    assert.equal(result.state?.clientRequestId, before.clientRequestId);
    assert.equal(result.state?.photoObjectId, before.photoObjectId);
  }
});

// ── onCh015 ────────────────────────────────────────────────────────────────

test('onCh015 forces evidenceUploadState to uncertain and preserves both ids, from any prior state', () => {
  for (const prior of ['not_uploaded', 'confirmed', 'uncertain'] as const) {
    const result = onCh015(attempt(prior));
    assert.equal(result.evidenceUploadState, 'uncertain');
    assert.equal(result.clientRequestId, 'cri-1');
    assert.equal(result.photoObjectId, 'photo-1');
  }
});

// ── classifyRpcError ───────────────────────────────────────────────────────

test('classifyRpcError maps CH015 to the non-terminal ch015 category', () => {
  assert.equal(classifyRpcError({ code: 'CH015' }), 'ch015');
});

test('classifyRpcError maps CH003 to terminal_not_open', () => {
  assert.equal(classifyRpcError({ code: 'CH003' }), 'terminal_not_open');
});

test('classifyRpcError maps 28000 to terminal_not_authorized', () => {
  assert.equal(classifyRpcError({ code: '28000' }), 'terminal_not_authorized');
});

for (const code of ['CH014', 'CH018', 'CH019']) {
  test(`classifyRpcError maps ${code} to terminal_other`, () => {
    assert.equal(classifyRpcError({ code }), 'terminal_other');
  });
}

test('classifyRpcError maps any unrecognized code (or none) to generic_failure', () => {
  assert.equal(classifyRpcError({ code: 'SOME_OTHER_CODE' }), 'generic_failure');
  assert.equal(classifyRpcError(null), 'generic_failure');
  assert.equal(classifyRpcError(undefined), 'generic_failure');
});

// ── buildTaskCompletionEvidencePath ───────────────────────────────────────

test('buildTaskCompletionEvidencePath produces the exact 4-segment server-contract formula', () => {
  const path = buildTaskCompletionEvidencePath({
    householdId:          'h1',
    taskId:               't1',
    submittedByProfileId: 'p1',
    photoObjectId:         'o1',
  });
  assert.equal(path, 'h1/t1/p1/o1');
});

// ── validateEvidenceMimeType ───────────────────────────────────────────────

test('validateEvidenceMimeType: missing mime -> missing_mime', () => {
  assert.equal(validateEvidenceMimeType(undefined), 'missing_mime');
  assert.equal(validateEvidenceMimeType(null), 'missing_mime');
  assert.equal(validateEvidenceMimeType(''), 'missing_mime');
});

test('validateEvidenceMimeType: unsupported mime -> unsupported_mime', () => {
  assert.equal(validateEvidenceMimeType('application/octet-stream'), 'unsupported_mime');
  assert.equal(validateEvidenceMimeType('image/bmp'), 'unsupported_mime');
});

// The allowed-mime allowlist is matched exactly, not case-insensitively —
// there is no repository/source basis for treating a differently-cased
// value as equivalent, and the bucket's own allowed_mime_types array is
// lowercase, so this is the conservative default until evidence says
// otherwise.
test('validateEvidenceMimeType: matching is case-sensitive — a differently-cased value is rejected', () => {
  assert.equal(validateEvidenceMimeType('IMAGE/PNG'), 'unsupported_mime');
  assert.equal(validateEvidenceMimeType('Image/Png'), 'unsupported_mime');
});

for (const mimeType of ALLOWED_EVIDENCE_MIME_TYPES) {
  test(`validateEvidenceMimeType: ${mimeType} is accepted`, () => {
    assert.equal(validateEvidenceMimeType(mimeType), 'ok');
  });
}

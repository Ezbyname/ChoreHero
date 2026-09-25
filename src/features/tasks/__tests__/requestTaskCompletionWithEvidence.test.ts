import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageApiError } from '@supabase/supabase-js';
import type { PostgrestError } from '@supabase/supabase-js';

import {
  ensureEvidenceUploaded,
  submitTaskCompletionWithEvidence,
  type AttemptStateWithPhoto,
} from '@/features/tasks/requestTaskCompletionWithEvidence';
import { startNewAttempt } from '@/features/tasks/taskCompletionAttempt';
import { useAppStore } from '@/store/useAppStore';
import type { TaskCompletionSubmissionRow } from '@/types/supabase';

// Orchestration-level tests — real branching coverage (2xx / duplicate /
// uncertain / CH015 / etc.), not just the isSupabaseConfigured===false
// mock-mode guard every other repository/feature test in this codebase is
// limited to. Made possible by ensureEvidenceUploaded/
// submitTaskCompletionWithEvidence accepting the repository-shaped
// functions (uploadEvidenceFn/requestCompletionFn) as parameters — a small,
// scoped, framework-free injection seam, not a DI framework and not a
// change to how any other feature file in this repo is tested.

const task = { id: 'task-1', householdId: 'household-1' };
const photo = { blob: new Blob(['x'], { type: 'image/png' }), mimeType: 'image/png' };

function photoAttempt(evidenceUploadState: 'not_uploaded' | 'confirmed' | 'uncertain' = 'not_uploaded'): AttemptStateWithPhoto {
  return { clientRequestId: 'cri-1', photoObjectId: 'photo-1', evidenceUploadState };
}

function submissionRow(overrides: Partial<TaskCompletionSubmissionRow> = {}): TaskCompletionSubmissionRow {
  return {
    id:                      'submission-1',
    task_id:                 'task-1',
    household_id:            'household-1',
    submitted_by_profile_id: 'profile-1',
    client_request_id:       'cri-1',
    photo_storage_path:      'household-1/task-1/profile-1/photo-1',
    status:                  'pending',
    reviewed_by_profile_id:  null,
    reviewed_at:             null,
    submitted_at:            '2026-09-24T00:00:00Z',
    created_at:              '2026-09-24T00:00:00Z',
    updated_at:              '2026-09-24T00:00:00Z',
    ...overrides,
  };
}

function pgError(code: string): PostgrestError {
  return { message: code, details: '', hint: '', code } as PostgrestError;
}

// beforeEach/afterEach: set and restore authUser so callerId resolution
// (useAppStore.getState().authUser?.id) is deterministic across tests.
const priorAuthUser = useAppStore.getState().authUser;
function withAuthenticatedCaller(id: string) {
  // @ts-expect-error — test-only minimal shape, only .id is read by ensureEvidenceUploaded
  useAppStore.setState({ authUser: { id } });
}
function clearAuthUser() {
  useAppStore.setState({ authUser: null });
}
test.after(() => {
  useAppStore.setState({ authUser: priorAuthUser });
});

// ── ensureEvidenceUploaded ─────────────────────────────────────────────────

test('ensureEvidenceUploaded: already confirmed -> no-op, upload fn never called', async () => {
  withAuthenticatedCaller('profile-1');
  let calls = 0;
  const result = await ensureEvidenceUploaded(photoAttempt('confirmed'), task, photo, async () => {
    calls += 1;
    return { data: { path: 'x' }, error: null };
  });
  assert.equal(result.kind, 'confirmed');
  assert.equal(calls, 0);
});

test('ensureEvidenceUploaded: missing MIME -> validation_error, upload fn never called', async () => {
  withAuthenticatedCaller('profile-1');
  let calls = 0;
  const result = await ensureEvidenceUploaded(
    photoAttempt(),
    task,
    { blob: new Blob(['x']), mimeType: '' },
    async () => { calls += 1; return { data: { path: 'x' }, error: null }; },
  );
  assert.equal(result.kind, 'validation_error');
  if (result.kind === 'validation_error') assert.equal(result.reason, 'missing_mime');
  assert.equal(calls, 0);
});

test('ensureEvidenceUploaded: unsupported MIME -> validation_error, upload fn never called', async () => {
  withAuthenticatedCaller('profile-1');
  let calls = 0;
  const result = await ensureEvidenceUploaded(
    photoAttempt(),
    task,
    { blob: new Blob(['x']), mimeType: 'application/octet-stream' },
    async () => { calls += 1; return { data: { path: 'x' }, error: null }; },
  );
  assert.equal(result.kind, 'validation_error');
  if (result.kind === 'validation_error') assert.equal(result.reason, 'unsupported_mime');
  assert.equal(calls, 0);
});

test('ensureEvidenceUploaded: not authenticated -> not_authenticated, upload fn never called', async () => {
  clearAuthUser();
  let calls = 0;
  const result = await ensureEvidenceUploaded(photoAttempt(), task, photo, async () => {
    calls += 1;
    return { data: { path: 'x' }, error: null };
  });
  assert.equal(result.kind, 'not_authenticated');
  assert.equal(calls, 0);
});

test('ensureEvidenceUploaded: 2xx -> confirmed, called with the exact canonical path', async () => {
  withAuthenticatedCaller('profile-1');
  let capturedPath: string | undefined;
  const result = await ensureEvidenceUploaded(photoAttempt(), task, photo, async (input) => {
    capturedPath = input.path;
    return { data: { path: input.path }, error: null };
  });
  assert.equal(result.kind, 'confirmed');
  assert.equal(capturedPath, 'household-1/task-1/profile-1/photo-1');
});

test('ensureEvidenceUploaded: re-wraps the blob so the uploaded blob.type always matches photo.mimeType, regardless of the input blob\'s own type', async () => {
  withAuthenticatedCaller('profile-1');
  const untyped = new Blob(['x'], { type: 'application/octet-stream' }); // deliberately wrong/inconsistent .type
  let capturedBlob: Blob | undefined;
  const result = await ensureEvidenceUploaded(
    photoAttempt(),
    task,
    { blob: untyped, mimeType: 'image/png' },
    async (input) => { capturedBlob = input.blob; return { data: { path: input.path }, error: null }; },
  );
  assert.equal(result.kind, 'confirmed');
  assert.equal(capturedBlob?.type, 'image/png');
  assert.notEqual(capturedBlob, untyped); // a genuinely new Blob, not the caller's original passed through
});

test('ensureEvidenceUploaded: re-wraps even when the input blob has no type at all', async () => {
  withAuthenticatedCaller('profile-1');
  const noType = new Blob(['x']); // .type === '' by default
  let capturedBlob: Blob | undefined;
  await ensureEvidenceUploaded(
    photoAttempt(),
    task,
    { blob: noType, mimeType: 'image/jpeg' },
    async (input) => { capturedBlob = input.blob; return { data: { path: input.path }, error: null }; },
  );
  assert.equal(capturedBlob?.type, 'image/jpeg');
});

test('ensureEvidenceUploaded: verified duplicate -> confirmed', async () => {
  withAuthenticatedCaller('profile-1');
  const result = await ensureEvidenceUploaded(photoAttempt(), task, photo, async () => ({
    data: null,
    error: new StorageApiError('Duplicate', 400, '409'),
  }));
  assert.equal(result.kind, 'confirmed');
});

test('ensureEvidenceUploaded: unknown/no-response error -> uncertain', async () => {
  withAuthenticatedCaller('profile-1');
  const result = await ensureEvidenceUploaded(photoAttempt(), task, photo, async () => ({
    data: null,
    error: new Error('fetch failed'),
  }));
  assert.equal(result.kind, 'uncertain');
});

test('ensureEvidenceUploaded: 5xx -> uncertain', async () => {
  withAuthenticatedCaller('profile-1');
  const result = await ensureEvidenceUploaded(photoAttempt(), task, photo, async () => ({
    data: null,
    error: new StorageApiError('Internal Error', 500, '500'),
  }));
  assert.equal(result.kind, 'uncertain');
});

test('ensureEvidenceUploaded: non-duplicate 4xx (unproven pre-write) -> uncertain', async () => {
  withAuthenticatedCaller('profile-1');
  const result = await ensureEvidenceUploaded(photoAttempt(), task, photo, async () => ({
    data: null,
    error: new StorageApiError('Bad Request', 400, '400'),
  }));
  assert.equal(result.kind, 'uncertain');
});

test('ensureEvidenceUploaded: PGRST_NOT_CONFIGURED -> not_configured, not uncertain', async () => {
  withAuthenticatedCaller('profile-1');
  const result = await ensureEvidenceUploaded(photoAttempt(), task, photo, async () => ({
    data: null,
    error: pgError('PGRST_NOT_CONFIGURED'),
  }));
  assert.equal(result.kind, 'not_configured');
});

// ── submitTaskCompletionWithEvidence ──────────────────────────────────────

test('submitTaskCompletionWithEvidence: 2xx upload -> confirmed -> RPC is called and its success returned', async () => {
  withAuthenticatedCaller('profile-1');
  let rpcCalled = false;
  const result = await submitTaskCompletionWithEvidence(photoAttempt(), task, photo, {
    uploadEvidenceFn: async (input) => ({ data: { path: input.path }, error: null }),
    requestCompletionFn: async () => {
      rpcCalled = true;
      return { data: submissionRow(), error: null };
    },
  });
  assert.equal(rpcCalled, true);
  assert.equal(result.ok, true);
});

test('submitTaskCompletionWithEvidence: unknown/network upload outcome -> uncertain, RPC never called', async () => {
  withAuthenticatedCaller('profile-1');
  let rpcCalled = false;
  const result = await submitTaskCompletionWithEvidence(photoAttempt(), task, photo, {
    uploadEvidenceFn: async () => ({ data: null, error: new Error('fetch failed') }),
    requestCompletionFn: async () => { rpcCalled = true; return { data: submissionRow(), error: null }; },
  });
  assert.equal(rpcCalled, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'uncertain');
});

test('submitTaskCompletionWithEvidence: 5xx upload outcome -> uncertain, RPC never called', async () => {
  withAuthenticatedCaller('profile-1');
  let rpcCalled = false;
  const result = await submitTaskCompletionWithEvidence(photoAttempt(), task, photo, {
    uploadEvidenceFn: async () => ({ data: null, error: new StorageApiError('Internal Error', 500, '500') }),
    requestCompletionFn: async () => { rpcCalled = true; return { data: submissionRow(), error: null }; },
  });
  assert.equal(rpcCalled, false);
  if (!result.ok) assert.equal(result.reason, 'uncertain');
});

test('submitTaskCompletionWithEvidence: non-duplicate unproven 4xx upload outcome -> uncertain, RPC never called', async () => {
  withAuthenticatedCaller('profile-1');
  let rpcCalled = false;
  const result = await submitTaskCompletionWithEvidence(photoAttempt(), task, photo, {
    uploadEvidenceFn: async () => ({ data: null, error: new StorageApiError('Bad Request', 400, '400') }),
    requestCompletionFn: async () => { rpcCalled = true; return { data: submissionRow(), error: null }; },
  });
  assert.equal(rpcCalled, false);
  if (!result.ok) assert.equal(result.reason, 'uncertain');
});

test('submitTaskCompletionWithEvidence: generic RPC failure -> same ids preserved, not cleared', async () => {
  withAuthenticatedCaller('profile-1');
  const state = photoAttempt('confirmed'); // upload already confirmed for this attempt
  const result = await submitTaskCompletionWithEvidence(state, task, null, {
    requestCompletionFn: async () => ({ data: null, error: pgError('SOME_UNRECOGNIZED_CODE') }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'failed');
    assert.equal(result.state?.clientRequestId, state.clientRequestId);
    assert.equal(result.state?.photoObjectId, state.photoObjectId);
  }
});

test('submitTaskCompletionWithEvidence: CH015 -> same ids preserved, evidenceUploadState forced to uncertain, RPC not retried automatically', async () => {
  withAuthenticatedCaller('profile-1');
  const state = photoAttempt('confirmed');
  const result = await submitTaskCompletionWithEvidence(state, task, null, {
    requestCompletionFn: async () => ({ data: null, error: pgError('CH015') }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'uncertain');
    assert.equal(result.state?.evidenceUploadState, 'uncertain');
    assert.equal(result.state?.clientRequestId, state.clientRequestId);
    assert.equal(result.state?.photoObjectId, state.photoObjectId);
  }
});

test('submitTaskCompletionWithEvidence: CH015 recovery — re-invoking with the returned state re-uploads then retries the same RPC with the same ids', async () => {
  withAuthenticatedCaller('profile-1');
  const initial = photoAttempt('confirmed');

  const firstAttempt = await submitTaskCompletionWithEvidence(initial, task, null, {
    requestCompletionFn: async () => ({ data: null, error: pgError('CH015') }),
  });
  assert.equal(firstAttempt.ok, false);
  if (firstAttempt.ok) throw new Error('unreachable');
  assert.equal(firstAttempt.state?.evidenceUploadState, 'uncertain');

  let uploadCalledWithPath: string | undefined;
  let rpcCalledWith: { taskId: string; clientRequestId: string; photoObjectId: string | null } | undefined;

  const recovered = await submitTaskCompletionWithEvidence(
    firstAttempt.state as AttemptStateWithPhoto & NonNullable<typeof firstAttempt.state>,
    task,
    photo,
    {
      uploadEvidenceFn: async (input) => { uploadCalledWithPath = input.path; return { data: { path: input.path }, error: null }; },
      requestCompletionFn: async (input) => { rpcCalledWith = input; return { data: submissionRow(), error: null }; },
    },
  );

  assert.equal(uploadCalledWithPath, 'household-1/task-1/profile-1/photo-1');
  assert.equal(rpcCalledWith?.clientRequestId, initial.clientRequestId);
  assert.equal(rpcCalledWith?.photoObjectId, initial.photoObjectId);
  assert.equal(recovered.ok, true);
});

test('submitTaskCompletionWithEvidence: CH003 -> terminal, attempt cleared (state null)', async () => {
  withAuthenticatedCaller('profile-1');
  const result = await submitTaskCompletionWithEvidence(photoAttempt('confirmed'), task, null, {
    requestCompletionFn: async () => ({ data: null, error: pgError('CH003') }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'not_open');
    assert.equal(result.state, null);
  }
});

test('submitTaskCompletionWithEvidence: 28000 -> terminal, attempt cleared, not_authorized', async () => {
  withAuthenticatedCaller('profile-1');
  const result = await submitTaskCompletionWithEvidence(photoAttempt('confirmed'), task, null, {
    requestCompletionFn: async () => ({ data: null, error: pgError('28000') }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'not_authorized');
    assert.equal(result.state, null);
  }
});

test('submitTaskCompletionWithEvidence: photoObjectId null (no-photo submission) -> upload never called, RPC called with photoObjectId null', async () => {
  withAuthenticatedCaller('profile-1');
  let uploadCalled = false;
  let rpcCalledWith: { photoObjectId: string | null } | undefined;
  const noPhotoState = { clientRequestId: 'cri-2', photoObjectId: null, evidenceUploadState: 'confirmed' as const };

  const result = await submitTaskCompletionWithEvidence(noPhotoState, task, null, {
    uploadEvidenceFn: async (input) => { uploadCalled = true; return { data: { path: input.path }, error: null }; },
    requestCompletionFn: async (input) => { rpcCalledWith = input; return { data: submissionRow({ photo_storage_path: null }), error: null }; },
  });

  assert.equal(uploadCalled, false);
  assert.equal(rpcCalledWith?.photoObjectId, null);
  assert.equal(result.ok, true);
});

// ── photo/state consistency gate (regression coverage for the review that
// found the RPC could be reached with unresolved evidence) ────────────────

test('submitTaskCompletionWithEvidence: photo-bearing attempt still "uncertain", called with photo=null -> RPC must NOT run', async () => {
  withAuthenticatedCaller('profile-1');
  let uploadCalled = false;
  let rpcCalled = false;

  const result = await submitTaskCompletionWithEvidence(photoAttempt('uncertain'), task, null, {
    uploadEvidenceFn: async (input) => { uploadCalled = true; return { data: { path: input.path }, error: null }; },
    requestCompletionFn: async () => { rpcCalled = true; return { data: submissionRow(), error: null }; },
  });

  assert.equal(uploadCalled, false);
  assert.equal(rpcCalled, false);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'failed');
    // state is preserved unchanged, not silently cleared or reclassified —
    // the caller must supply the photo again to resolve it.
    assert.equal(result.state?.evidenceUploadState, 'uncertain');
    assert.equal(result.state?.clientRequestId, 'cri-1');
    assert.equal(result.state?.photoObjectId, 'photo-1');
  }
});

test('submitTaskCompletionWithEvidence: photo-bearing attempt still "not_uploaded", called with photo=null -> RPC must NOT run', async () => {
  withAuthenticatedCaller('profile-1');
  let uploadCalled = false;
  let rpcCalled = false;

  const result = await submitTaskCompletionWithEvidence(photoAttempt('not_uploaded'), task, null, {
    uploadEvidenceFn: async (input) => { uploadCalled = true; return { data: { path: input.path }, error: null }; },
    requestCompletionFn: async () => { rpcCalled = true; return { data: submissionRow(), error: null }; },
  });

  assert.equal(uploadCalled, false);
  assert.equal(rpcCalled, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'failed');
});

test('submitTaskCompletionWithEvidence: no-photo attempt (photoObjectId null) called WITH a photo -> state mismatch, no upload, no RPC', async () => {
  withAuthenticatedCaller('profile-1');
  let uploadCalled = false;
  let rpcCalled = false;
  const noPhotoState = { clientRequestId: 'cri-3', photoObjectId: null, evidenceUploadState: 'confirmed' as const };

  const result = await submitTaskCompletionWithEvidence(noPhotoState, task, photo, {
    uploadEvidenceFn: async (input) => { uploadCalled = true; return { data: { path: input.path }, error: null }; },
    requestCompletionFn: async () => { rpcCalled = true; return { data: submissionRow(), error: null }; },
  });

  assert.equal(uploadCalled, false);
  assert.equal(rpcCalled, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'failed'); // not 'invalid_mime' — this is a state mismatch, not a MIME problem
});

test('submitTaskCompletionWithEvidence: photo-bearing attempt already "confirmed", called with photo=null -> legitimate RPC-only retry, upload never called', async () => {
  withAuthenticatedCaller('profile-1');
  let uploadCalled = false;
  let rpcCalled = false;

  const result = await submitTaskCompletionWithEvidence(photoAttempt('confirmed'), task, null, {
    uploadEvidenceFn: async (input) => { uploadCalled = true; return { data: { path: input.path }, error: null }; },
    requestCompletionFn: async () => { rpcCalled = true; return { data: submissionRow(), error: null }; },
  });

  assert.equal(uploadCalled, false);
  assert.equal(rpcCalled, true);
  assert.equal(result.ok, true);
});

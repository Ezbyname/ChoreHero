import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageApiError } from '@supabase/supabase-js';
import type { PostgrestError } from '@supabase/supabase-js';

import {
  beginCompletionSubmit,
  finishCompletionSubmit,
  type CompletionSubmitDeps,
} from '@/features/tasks/components/taskCompletionSubmitFlow';
import {
  INITIAL_UI_STATE,
  canSubmit,
  onPhotosAdded,
  onPhotoRemovedAt,
  type SelectedPhoto,
  type TaskCompletionUiState,
} from '@/features/tasks/components/taskCompletionUiState';
import { materializeEvidencePhoto } from '@/features/tasks/materializeEvidencePhoto';
import { submitTaskCompletionWithPhotos } from '@/features/tasks/requestTaskCompletionWithPhotos';
import { useAppStore } from '@/store/useAppStore';
import type { TaskCompletionSubmissionRow } from '@/types/supabase';

// Drives the Modal's real submit sequence (beginCompletionSubmit +
// finishCompletionSubmit) through the REAL multi-photo orchestration
// (submitTaskCompletionWithPhotos -> submitTaskCompletionWithEvidence /
// ensureEvidenceUploaded) and the REAL materializer, with only the I/O
// edges faked: the local-file read, the Storage upload, and the two RPCs.

const task = { id: 'task-1', householdId: 'household-1' };
const CAMERA:  SelectedPhoto = { previewUri: 'file:///data/user/0/app/cache/ImagePicker/camera-1.jpg', mimeType: 'image/jpeg', source: 'camera' };
const GALLERY: SelectedPhoto = { previewUri: 'file:///data/user/0/app/cache/ImagePicker/gallery-1.png', mimeType: 'image/png', source: 'gallery' };
const photo = (n: number, source: 'camera' | 'gallery' = n % 2 ? 'camera' : 'gallery'): SelectedPhoto =>
  ({ previewUri: `file:///p-${n}.jpg`, mimeType: 'image/jpeg', source });

function makeIdGen(prefix = 'uuid') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function row(overrides: Partial<TaskCompletionSubmissionRow> = {}): TaskCompletionSubmissionRow {
  return {
    id: 'submission-1', task_id: 'task-1', household_id: 'household-1', submitted_by_profile_id: 'profile-1',
    client_request_id: 'uuid-1', photo_storage_path: null, status: 'pending', reviewed_by_profile_id: null,
    reviewed_at: null, submitted_at: '2026-10-28T00:00:00Z', created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z',
    ...overrides,
  };
}
const pgError = (code: string) => ({ message: code, details: '', hint: '', code } as PostgrestError);
const duplicateError = () => new StorageApiError('The resource already exists', 400, '409');

type Rpc = { fn: 'v2' | 'v3'; clientRequestId: string; photoObjectIds: string[] };

function world(opts: {
  readFails?: string[];               // previewUris whose local read throws
  uploads?:   Array<{ error: unknown }>;
  rpcs?:      Array<{ error: PostgrestError | null }>;
} = {}) {
  const reads: string[] = [];
  const uploads: Array<{ path: string; contentType: string; size: number }> = [];
  const rpcCalls: Rpc[] = [];
  const progress: Array<[number, number]> = [];
  const uploadQ = [...(opts.uploads ?? [])];
  const rpcQ    = [...(opts.rpcs ?? [])];
  let live = 0;
  let maxLive = 0;
  const answer = (): { error: PostgrestError | null } => rpcQ.shift() ?? { error: null };

  const deps: CompletionSubmitDeps = {
    materialize: (uri, mime) => materializeEvidencePhoto(uri, mime, async () => {
      reads.push(uri);
      if (opts.readFails?.includes(uri)) throw new TypeError('Network request failed');
      live++; maxLive = Math.max(maxLive, live);
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
    }),
    submit: (attempt, t, load, d) => submitTaskCompletionWithPhotos(attempt, t, load, {
      ...d,
      uploadEvidenceFn: async (input) => {
        uploads.push({ path: input.path, contentType: input.contentType, size: input.bytes.byteLength });
        live--;
        const next = uploadQ.shift() ?? { error: null };
        return next.error ? { data: null, error: next.error as Error } : { data: { path: input.path }, error: null };
      },
      requestV2Fn: async (input) => {
        rpcCalls.push({ fn: 'v2', clientRequestId: input.clientRequestId, photoObjectIds: input.photoObjectId ? [input.photoObjectId] : [] });
        const next = answer();
        return next.error ? { data: null, error: next.error } : { data: row({ client_request_id: input.clientRequestId }), error: null };
      },
      requestV3Fn: async (input) => {
        rpcCalls.push({ fn: 'v3', clientRequestId: input.clientRequestId, photoObjectIds: [...input.photoObjectIds] });
        const next = answer();
        return next.error ? { data: null, error: next.error } : { data: row({ client_request_id: input.clientRequestId }), error: null };
      },
    }),
    onProgress: (p) => { progress.push([p.current, p.total]); },
  };
  return { deps, reads, uploads, rpcCalls, progress, maxLive: () => maxLive };
}

const priorAuthUser = useAppStore.getState().authUser;
test.beforeEach(() => {
  // @ts-expect-error — test-only minimal shape, only .id is read
  useAppStore.setState({ authUser: { id: 'profile-1' } });
});
test.after(() => { useAppStore.setState({ authUser: priorAuthUser }); });

async function submitOnce(state: TaskCompletionUiState, deps: CompletionSubmitDeps, gen = makeIdGen('submit')) {
  const working = beginCompletionSubmit(state, gen);
  if (working.phase !== 'submitting') return { state: working, completed: false, submission: null };
  return finishCompletionSubmit(working, task, deps);
}
const path = (id: string) => `household-1/task-1/profile-1/${id}`;

// ── 0 / 1 photo stay on the proven v2 path ──────────────────────────────────

test('0 photos: no read, no upload, ONE v2 RPC with no photo, completed', async () => {
  const w = world();
  const out = await submitOnce(INITIAL_UI_STATE, w.deps);
  assert.equal(out.completed, true);
  assert.equal(w.reads.length, 0);
  assert.equal(w.uploads.length, 0);
  assert.deepEqual(w.rpcCalls.map((c) => [c.fn, c.photoObjectIds.length]), [['v2', 0]]);
  assert.ok(out.submission);
});

for (const [label, asset] of [['Camera', CAMERA], ['Gallery', GALLERY]] as const) {
  test(`1 photo (${label}): bytes uploaded to the canonical path with the picker MIME, then ONE v2 RPC`, async () => {
    const w = world();
    const s = onPhotosAdded(INITIAL_UI_STATE, [asset], makeIdGen());
    const out = await submitOnce(s, w.deps);
    assert.equal(out.completed, true);
    assert.deepEqual(out.state, INITIAL_UI_STATE);
    const id = s.attempt!.photos[0].photoObjectId;
    assert.deepEqual(w.uploads, [{ path: path(id), contentType: asset.mimeType, size: 4 }]);
    assert.deepEqual(w.rpcCalls, [{ fn: 'v2', clientRequestId: s.attempt!.clientRequestId, photoObjectIds: [id] }]);
  });
}

// ── 2..5 photos: sequential uploads, one v3 RPC ─────────────────────────────

test('5 photos (mixed Camera/Gallery): read + uploaded one at a time in order, ONE v3 RPC with the ordered ids', async () => {
  const w = world();
  const s = onPhotosAdded(INITIAL_UI_STATE, [photo(1, 'camera'), photo(2, 'gallery'), photo(3, 'gallery'), photo(4, 'camera'), photo(5, 'gallery')], makeIdGen());
  const out = await submitOnce(s, w.deps);
  assert.equal(out.completed, true);
  const ids = s.attempt!.photos.map((p) => p.photoObjectId);
  assert.deepEqual(w.uploads.map((u) => u.path), ids.map(path));
  assert.deepEqual(w.rpcCalls, [{ fn: 'v3', clientRequestId: s.attempt!.clientRequestId, photoObjectIds: ids }]);
  assert.deepEqual(w.progress, [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]]);
  // Large-photo safety: never more than one photo's bytes in flight.
  assert.equal(w.maxLive(), 1);
});

test('upload of photo 3 uncertain -> retryable; the retry skips confirmed photos and reuses EVERY id', async () => {
  const w = world({ uploads: [{ error: null }, { error: null }, { error: new Error('socket closed') }] });
  const s = onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2), photo(3)], makeIdGen());
  const first = await submitOnce(s, w.deps);
  assert.equal(first.completed, false);
  assert.equal(first.state.error?.kind, 'network_uncertain');
  assert.deepEqual(first.state.attempt!.photos.map((p) => p.evidenceUploadState), ['confirmed', 'confirmed', 'uncertain']);
  assert.equal(w.rpcCalls.length, 0);

  const retry = await submitOnce(first.state, w.deps, () => 'MUST-NOT-BE-USED');
  assert.equal(retry.completed, true);
  // Only photo 3 is read and uploaded again, at the same path.
  assert.deepEqual(w.uploads.map((u) => u.path), [...s.attempt!.photos.map((p) => path(p.photoObjectId)), path(s.attempt!.photos[2].photoObjectId)]);
  assert.deepEqual(w.rpcCalls, [{ fn: 'v3', clientRequestId: s.attempt!.clientRequestId, photoObjectIds: s.attempt!.photos.map((p) => p.photoObjectId) }]);
});

test('a verified duplicate on retry counts as uploaded (never upsert, never a new id)', async () => {
  const w = world({ uploads: [{ error: null }, { error: new Error('x') }, { error: duplicateError() }] });
  const s = onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2)], makeIdGen());
  const first = await submitOnce(s, w.deps);
  const retry = await submitOnce(first.state, w.deps);
  assert.equal(retry.completed, true);
  assert.equal(w.rpcCalls.length, 1);
});

test('v3 generic failure keeps every photo confirmed: the retry calls the RPC again without re-reading or re-uploading', async () => {
  const w = world({ rpcs: [{ error: pgError('PGRST500') }] });
  const s = onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2)], makeIdGen());
  const first = await submitOnce(s, w.deps);
  assert.equal(first.state.error?.kind, 'retryable_failed');
  const readsBefore = w.reads.length;
  const retry = await submitOnce(first.state, w.deps);
  assert.equal(retry.completed, true);
  assert.equal(w.reads.length, readsBefore);
  assert.equal(w.uploads.length, 2);
  assert.deepEqual(w.rpcCalls[0], w.rpcCalls[1]);
});

test('v3 CH015 -> every photo back to uncertain; the retry re-establishes each at the SAME path', async () => {
  const w = world({ rpcs: [{ error: pgError('CH015') }] });
  const s = onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2)], makeIdGen());
  const first = await submitOnce(s, w.deps);
  assert.equal(first.state.error?.kind, 'network_uncertain');
  assert.deepEqual(first.state.attempt!.photos.map((p) => p.evidenceUploadState), ['uncertain', 'uncertain']);
  const retry = await submitOnce(first.state, w.deps);
  assert.equal(retry.completed, true);
  assert.deepEqual(w.uploads.map((u) => u.path).slice(2), w.uploads.map((u) => u.path).slice(0, 2));
});

test('terminal CH014 / CH018 / CH021 -> attempt_rejected, Submit blocked until the set changes', async () => {
  for (const code of ['CH014', 'CH018', 'CH021']) {
    const w = world({ rpcs: [{ error: pgError(code) }] });
    const s = onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2)], makeIdGen());
    const out = await submitOnce(s, w.deps);
    assert.equal(out.state.error?.kind, 'attempt_rejected', code);
    assert.equal(canSubmit(out.state), false);
    assert.equal(out.state.photos.length, 2);
  }
});

test('CH003 not open -> terminal not_open; 28000 -> terminal not_authorized', async () => {
  for (const [code, kind] of [['CH003', 'not_open'], ['28000', 'not_authorized']] as const) {
    const w = world({ rpcs: [{ error: pgError(code) }] });
    const out = await submitOnce(onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2)], makeIdGen()), w.deps);
    assert.equal(out.state.error?.kind, kind);
    assert.equal(out.completed, false);
  }
});

test('a photo that cannot be read -> photo_read_failed, nothing after it uploaded, no RPC, earlier uploads kept confirmed', async () => {
  const w = world({ readFails: ['file:///p-2.jpg'] });
  const s = onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2), photo(3)], makeIdGen());
  const out = await submitOnce(s, w.deps);
  assert.equal(out.state.error?.kind, 'photo_read_failed');
  assert.equal(w.uploads.length, 1);
  assert.equal(w.rpcCalls.length, 0);
  assert.deepEqual(out.state.attempt!.photos.map((p) => p.evidenceUploadState), ['confirmed', 'not_uploaded', 'not_uploaded']);
});

test('the orchestration throwing never leaves the sheet stuck submitting; ids preserved', async () => {
  const s = onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2)], makeIdGen());
  const out = await submitOnce(s, { submit: async () => { throw new Error('boom'); } });
  assert.equal(out.state.phase, 'retryable_failed');
  assert.equal(out.state.error?.kind, 'unexpected_failure');
  assert.equal(out.state.attempt, s.attempt);
});

test('removing a photo after a failed attempt submits a brand-new attempt (new clientRequestId + ids)', async () => {
  const w = world({ rpcs: [{ error: pgError('CH014') }] });
  const gen = makeIdGen();
  const s = onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2), photo(3)], gen);
  const rejected = await submitOnce(s, w.deps);
  const fixed = onPhotoRemovedAt(rejected.state, 2, gen);
  const out = await submitOnce(fixed, w.deps);
  assert.equal(out.completed, true);
  assert.notEqual(w.rpcCalls[1].clientRequestId, w.rpcCalls[0].clientRequestId);
  for (const id of w.rpcCalls[1].photoObjectIds) assert.ok(!w.rpcCalls[0].photoObjectIds.includes(id));
});

test('the submit path never navigates or touches app-wide hydration (inline progress only)', async () => {
  const before = useAppStore.getState().appHydrationState;
  const w = world();
  await submitOnce(onPhotosAdded(INITIAL_UI_STATE, [photo(1), photo(2)], makeIdGen()), w.deps);
  assert.equal(useAppStore.getState().appHydrationState, before);
});

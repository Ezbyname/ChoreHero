// Configured-mode coverage for the child's pending-completion features
// (lookup + withdraw) and the Add/Change-photo hand-over to a NEW logical
// attempt. Env set at top so isSupabaseConfigured=true in this isolated
// child process (same pattern as approveTaskCompletionSubmission.refresh
// .test.ts); the deps seams substitute fake repository functions, so no
// Supabase traffic happens.

import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.EXPO_PUBLIC_SUPABASE_URL      = 'https://test.example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';

const { getChildPendingCompletion, withdrawChildPendingCompletion } = await import('@/features/tasks/childPendingCompletion');
const { beginCompletionSubmit, finishCompletionSubmit }             = await import('@/features/tasks/components/taskCompletionSubmitFlow');
const { INITIAL_UI_STATE, onPhotosAdded }                           = await import('@/features/tasks/components/taskCompletionUiState');
const { useAppStore }                                               = await import('@/store/useAppStore');
import type { PostgrestError } from '@supabase/supabase-js';
import type { TaskCompletionSubmissionRow } from '@/types/supabase';
import type { Task } from '@/types';

function row(overrides: Partial<TaskCompletionSubmissionRow> = {}): TaskCompletionSubmissionRow {
  return {
    id:                      'sub-OLD',
    task_id:                 't-1',
    household_id:            'hh-1',
    submitted_by_profile_id: 'child-1',
    client_request_id:       'cri-OLD',
    photo_storage_path:      null,
    status:                  'pending',
    reviewed_by_profile_id:  null,
    reviewed_at:             null,
    submitted_at:            '2026-10-29T00:00:00Z',
    created_at:              '2026-10-29T00:00:00Z',
    updated_at:              '2026-10-29T00:00:00Z',
    ...overrides,
  };
}

const taskRow = (status: string) => ({
  id: 't-1', household_id: 'hh-1', created_by_profile_id: 'owner-1', assignee_profile_id: 'child-1',
  title: 'Feed the cat', description: null, due_at: null, due_at_has_time: null, status, points: 5,
});

const pg = (code: string) => ({ code, message: code, details: '', hint: '' } as PostgrestError);

let hydrationRetries = 0;
let refreshRequests: string[] = [];
const recordRefresh = (reason: string) => { refreshRequests.push(reason); };
const originalRetry = useAppStore.getState().requestAppDataHydrationRetry;
beforeEach(() => {
  hydrationRetries = 0;
  refreshRequests = [];
  const seeded: Task = { id: 't-1', title: 'Feed the cat', status: 'needs_attention', assigneeId: 'child-1', householdId: 'hh-1', points: 5 };
  useAppStore.setState({
    tasks: [seeded],
    requestAppDataHydrationRetry: () => { hydrationRetries += 1; },
  });
});
afterEach(() => {
  useAppStore.setState({ requestAppDataHydrationRetry: originalRetry });
});

// ── lookup ────────────────────────────────────────────────────────────────

test('lookup: no-photo / 1-photo (pre-migration row) / 4-photo pending -> counts only; raw path never returned', async () => {
  const noPhoto = await getChildPendingCompletion({ taskId: 't-1', role: 'child' }, { getPendingFn: async () => ({ data: row(), error: null }) });
  assert.deepEqual(noPhoto, { ok: true, data: { submissionId: 'sub-OLD', hasPhoto: false, photoCount: 0 } });

  const withPhoto = await getChildPendingCompletion({ taskId: 't-1', role: 'child' }, {
    getPendingFn: async () => ({ data: row({ photo_storage_path: 'hh-1/t-1/child-1/p-OLD' }), error: null }),
  });
  assert.deepEqual(withPhoto, { ok: true, data: { submissionId: 'sub-OLD', hasPhoto: true, photoCount: 1 } });
  assert.ok(!JSON.stringify(withPhoto).includes('hh-1/t-1'));

  const four = await getChildPendingCompletion({ taskId: 't-1', role: 'child' }, {
    getPendingFn: async () => ({ data: row({ photo_storage_path: 'hh-1/t-1/child-1/p-1', photo_count: 4 }), error: null }),
  });
  assert.deepEqual(four, { ok: true, data: { submissionId: 'sub-OLD', hasPhoto: true, photoCount: 4 } });
});

test('lookup: nothing pending -> not_found; query error -> failed; non-child -> not_authorized without a query', async () => {
  assert.deepEqual(await getChildPendingCompletion({ taskId: 't-1', role: 'child' }, { getPendingFn: async () => ({ data: null, error: null }), requestRefresh: () => undefined }), { ok: false, reason: 'not_found' });
  assert.deepEqual(await getChildPendingCompletion({ taskId: 't-1', role: 'child' }, { getPendingFn: async () => ({ data: null, error: pg('PGRST500') }) }), { ok: false, reason: 'failed' });
  let calls = 0;
  const r = await getChildPendingCompletion({ taskId: 't-1', role: 'owner' }, { getPendingFn: async () => { calls++; return { data: row(), error: null }; } });
  assert.deepEqual(r, { ok: false, reason: 'not_authorized' });
  assert.equal(calls, 0);
});

// ── withdraw ──────────────────────────────────────────────────────────────

test('cancel success: withdraw RPC once with the submission id, task refreshed to open, ok', async () => {
  const calls: string[] = [];
  const r = await withdrawChildPendingCompletion(
    { submissionId: 'sub-OLD', taskId: 't-1', householdId: 'hh-1', role: 'child' },
    {
      withdrawFn: async (id) => { calls.push(id); return { data: row({ status: 'withdrawn' }), error: null }; },
      getTasksFn: async () => ({ data: [taskRow('open')], error: null } as never),
      requestRefresh: recordRefresh,
    },
  );
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, ['sub-OLD']);
  assert.equal(useAppStore.getState().tasks.find((t) => t.id === 't-1')?.status, 'open');
  // Never a full re-hydration (that remounted the navigator on Today).
  assert.equal(hydrationRetries, 0);
  assert.deepEqual(refreshRequests, ['mutation']);
});

test('cancel success + refresh failure: still ok, task mirrored open locally, background refresh (no re-hydration), no second withdraw', async () => {
  let withdrawCalls = 0;
  const r = await withdrawChildPendingCompletion(
    { submissionId: 'sub-OLD', taskId: 't-1', householdId: 'hh-1', role: 'child' },
    {
      withdrawFn: async () => { withdrawCalls++; return { data: row({ status: 'withdrawn' }), error: null }; },
      getTasksFn: async () => ({ data: null, error: pg('PGRST500') }),
      requestRefresh: recordRefresh,
    },
  );
  assert.deepEqual(r, { ok: true });
  assert.equal(withdrawCalls, 1);
  assert.equal(useAppStore.getState().tasks.find((t) => t.id === 't-1')?.status, 'open');
  assert.equal(hydrationRetries, 0);
  assert.deepEqual(refreshRequests, ['mutation']);
});

test('cancel failure: task stays pending locally; CH017 -> not_pending (+ stale refresh), 28000 -> not_authorized, other -> failed', async () => {
  for (const [codeValue, reason, expectRefresh] of [
    ['CH017', 'not_pending', ['stale']], ['28000', 'not_authorized', []], ['XX000', 'failed', []],
  ] as const) {
    let refreshed = 0;
    refreshRequests = [];
    const r = await withdrawChildPendingCompletion(
      { submissionId: 'sub-OLD', taskId: 't-1', householdId: 'hh-1', role: 'child' },
      {
        withdrawFn: async () => ({ data: null, error: pg(codeValue) }),
        getTasksFn: async () => { refreshed++; return { data: [], error: null }; },
        requestRefresh: recordRefresh,
      },
    );
    assert.deepEqual(r, { ok: false, reason });
    assert.equal(refreshed, 0);
    assert.deepEqual(refreshRequests, [...expectRefresh]);
    assert.equal(useAppStore.getState().tasks.find((t) => t.id === 't-1')?.status, 'needs_attention');
  }
});

test('a non-withdrawn row coming back is never treated as success', async () => {
  const r = await withdrawChildPendingCompletion(
    { submissionId: 'sub-OLD', taskId: 't-1', householdId: 'hh-1', role: 'child' },
    { withdrawFn: async () => ({ data: row({ status: 'approved' }), error: null }), getTasksFn: async () => ({ data: [], error: null }) },
  );
  assert.deepEqual(r, { ok: false, reason: 'failed' });
});

test('a parent/adult role is refused client-side and never calls the child withdraw RPC', async () => {
  let calls = 0;
  for (const role of ['owner', 'admin', 'adult', null]) {
    const r = await withdrawChildPendingCompletion(
      { submissionId: 'sub-OLD', taskId: 't-1', householdId: 'hh-1', role },
      { withdrawFn: async () => { calls++; return { data: row({ status: 'withdrawn' }), error: null }; } },
    );
    assert.deepEqual(r, { ok: false, reason: 'not_authorized' });
  }
  assert.equal(calls, 0);
});

// ── Add / Change photo = withdraw, then a NEW logical attempt ───────────────

test('change photos: after withdraw, the resend uses a NEW clientRequestId and NEW photoObjectIds', async () => {
  const old = row({ photo_storage_path: 'hh-1/t-1/child-1/p-OLD' });
  const w = await withdrawChildPendingCompletion(
    { submissionId: old.id, taskId: 't-1', householdId: 'hh-1', role: 'child' },
    { withdrawFn: async () => ({ data: { ...old, status: 'withdrawn' }, error: null }), getTasksFn: async () => ({ data: [taskRow('open')], error: null } as never) },
  );
  assert.equal(w.ok, true);

  // The completion Modal opens fresh (INITIAL_UI_STATE) and mints ids on selection.
  let n = 0;
  const gen = () => `fresh-${++n}`;
  const selected = onPhotosAdded(INITIAL_UI_STATE, [
    { previewUri: 'file:///new-1.jpg', mimeType: 'image/jpeg', source: 'camera' },
    { previewUri: 'file:///new-2.jpg', mimeType: 'image/jpeg', source: 'gallery' },
  ], gen);
  const rpc: Array<{ clientRequestId: string; photoObjectIds: string[] }> = [];
  const outcome = await finishCompletionSubmit(beginCompletionSubmit(selected, gen), { id: 't-1', householdId: 'hh-1' }, {
    materialize: async () => ({ ok: true, photo: { bytes: new ArrayBuffer(3), mimeType: 'image/jpeg' } }),
    submit: async (attempt) => {
      rpc.push({ clientRequestId: attempt.clientRequestId, photoObjectIds: attempt.photos.map((p) => p.photoObjectId) });
      return { ok: true, submission: row({ id: 'sub-NEW', client_request_id: attempt.clientRequestId }) };
    },
  });
  assert.equal(outcome.completed, true);
  assert.equal(rpc.length, 1);
  assert.notEqual(rpc[0].clientRequestId, old.client_request_id);
  assert.equal(rpc[0].photoObjectIds.length, 2);
  for (const id of rpc[0].photoObjectIds) assert.ok(!old.photo_storage_path!.endsWith(id));
});

test('add photo: withdraw succeeded but the resend fails -> task stays open and retryable, never faked as pending', async () => {
  await withdrawChildPendingCompletion(
    { submissionId: 'sub-OLD', taskId: 't-1', householdId: 'hh-1', role: 'child' },
    { withdrawFn: async () => ({ data: row({ status: 'withdrawn' }), error: null }), getTasksFn: async () => ({ data: [taskRow('open')], error: null } as never) },
  );
  let n = 0;
  const selected = onPhotosAdded(INITIAL_UI_STATE, [{ previewUri: 'file:///new.jpg', mimeType: 'image/jpeg', source: 'camera' }], () => `fresh-${++n}`);
  const outcome = await finishCompletionSubmit(beginCompletionSubmit(selected, () => 'unused'), { id: 't-1', householdId: 'hh-1' }, {
    materialize: async () => ({ ok: true, photo: { bytes: new ArrayBuffer(3), mimeType: 'image/jpeg' } }),
    submit: async (attempt) => ({ ok: false, attempt, reason: 'failed' }),
  });
  assert.equal(outcome.completed, false);
  assert.equal(outcome.state.error?.kind, 'retryable_failed');
  assert.equal(useAppStore.getState().tasks.find((t) => t.id === 't-1')?.status, 'open');
});

test('no direct table/Storage mutation in the child pending feature (RPC + read only)', () => {
  // Code only — comments legitimately name the reviewer functions.
  const src = readFileSync(new URL('../childPendingCompletion.ts', import.meta.url), 'utf8')
    .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.ok(!/\.storage\b|\.upload\(|\.remove\(|\.update\(|\.delete\(|\.insert\(|rejectTaskCompletion/.test(src));
  assert.ok(src.includes('withdrawTaskCompletionV2'));
});

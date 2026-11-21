// Configured-mode coverage for approve/reject submission wrappers —
// specifically the mutation-vs-refresh separation. Env-set-at-top makes
// isSupabaseConfigured=true in this isolated child process (same pattern
// as taskCompletionV2.pendingSubmission.test.ts); the real-mode branch
// of each wrapper is reached without any actual Supabase traffic because
// the deps seam substitutes fake repository functions.
//
// Core invariant under test:
//
//   V2 mutation success + any client-side refresh failure
//   =
//   wrapper returns { ok: true }
//   AND no second mutation is ever triggered
//   AND local state is reconciled (direct status mirror + sanctioned
//       hydration retry)

import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.EXPO_PUBLIC_SUPABASE_URL      = 'https://test.example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';

const { approveTaskCompletionSubmission } = await import('@/features/tasks/approveTaskCompletionSubmission');
const { rejectTaskCompletionSubmission }  = await import('@/features/tasks/rejectTaskCompletionSubmission');
const { useAppStore }                     = await import('@/store/useAppStore');
import type { Task } from '@/types';
import type { PostgrestError } from '@supabase/supabase-js';

const sampleTaskRow = (overrides: Record<string, unknown> = {}) => ({
  id:                      't-REFRESH',
  household_id:            'hh-R',
  created_by_profile_id:   'p-creator',
  assignee_profile_id:     'child-1',
  title:                   'refresh test',
  description:             null,
  due_at:                  null,
  due_at_has_time:         null,
  status:                  'completed',
  points:                  10,
  ...overrides,
});

const pgErr: PostgrestError = {
  code: 'PGRST500', message: 'db offline', details: '', hint: '',
} as PostgrestError;

function seedStore(task: Task): void {
  useAppStore.setState({ tasks: [task], pointsBalances: [] });
}

let hydrationRetryCount = 0;
// Background refresh requests (householdRefresh.ts). A committed mutation
// whose follow-up read failed asks for one of these — never a full
// re-hydration, which would remount the navigator behind a loading screen.
let refreshRequests: string[] = [];
const recordRefresh = (reason: string) => { refreshRequests.push(reason); };
const originalRetry = useAppStore.getState().requestAppDataHydrationRetry;
beforeEach(() => {
  hydrationRetryCount = 0;
  refreshRequests = [];
  // Count how many times the sanctioned hydration retry was requested.
  useAppStore.setState({
    requestAppDataHydrationRetry: () => { hydrationRetryCount += 1; },
  });
});
afterEach(() => {
  useAppStore.setState({ requestAppDataHydrationRetry: originalRetry });
});

// ─── APPROVE ──────────────────────────────────────────────────────────────

test('APPROVE 1 — V2 approve RPC fails → wrapper returns ok:false with the mapped reason (CH017 → not_pending)', async () => {
  seedStore({ id: 't-REFRESH', title: 'r', status: 'needs_attention', assigneeId: 'child-1', householdId: 'hh-R', points: 10 });
  let approveCalls = 0;
  let getTasksCalls = 0;
  const r = await approveTaskCompletionSubmission(
    { submissionId: 'sub', taskId: 't-REFRESH', householdId: 'hh-R', role: 'adult' },
    {
      requestRefresh: recordRefresh,
      approveFn:  async () => { approveCalls++; return { data: null, error: { code: 'CH017', message: '', details: '', hint: '' } as PostgrestError }; },
      getTasksFn: async () => { getTasksCalls++; return { data: null, error: pgErr }; },
    },
  );
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'not_pending');
  assert.equal(approveCalls, 1);
  // No direct task refetch after a mutation failure...
  assert.equal(getTasksCalls, 0);
  // ...but CH017 means this screen is stale: one background refresh.
  assert.deepEqual(refreshRequests, ['stale']);
  assert.equal(hydrationRetryCount, 0);
});

test('APPROVE 2 — RPC success + task refresh success → ok:true, refreshed tasks applied, no hydration retry needed', async () => {
  seedStore({ id: 't-REFRESH', title: 'r', status: 'needs_attention', assigneeId: 'child-1', householdId: 'hh-R', points: 10 });
  const r = await approveTaskCompletionSubmission(
    { submissionId: 'sub', taskId: 't-REFRESH', householdId: 'hh-R', role: 'adult' },
    {
      requestRefresh: recordRefresh,
      approveFn:   async () => ({ data: sampleTaskRow(), error: null } as never),
      getTasksFn:  async () => ({ data: [sampleTaskRow()], error: null }),
      getPointsFn: async () => ({ data: [], error: null }),
    },
  );
  assert.equal(r.ok, true);
  // Store reflects the server's new state via the fresh snapshot.
  assert.equal(useAppStore.getState().tasks.find((t) => t.id === 't-REFRESH')?.status, 'completed');
  // No fallback reconciliation was needed.
  assert.equal(hydrationRetryCount, 0);
  assert.deepEqual(refreshRequests, []);
});

test('APPROVE 3 — RPC success + task refresh FAILS → ok:true, local status mirrored to completed, background refresh requested (no re-hydration), NO second approve', async () => {
  seedStore({ id: 't-REFRESH', title: 'r', status: 'needs_attention', assigneeId: 'child-1', householdId: 'hh-R', points: 10 });
  let approveCalls = 0;
  const r = await approveTaskCompletionSubmission(
    { submissionId: 'sub', taskId: 't-REFRESH', householdId: 'hh-R', role: 'adult' },
    {
      requestRefresh: recordRefresh,
      approveFn:   async () => { approveCalls++; return { data: sampleTaskRow(), error: null } as never; },
      getTasksFn:  async () => ({ data: null, error: pgErr }),
      getPointsFn: async () => ({ data: [], error: null }),
    },
  );
  // Load-bearing: successful authoritative mutation is NEVER reported as failure.
  assert.equal(r.ok, true);
  // The one approve call fired exactly once — no retry was triggered.
  assert.equal(approveCalls, 1);
  // Local store reflects the known server transition.
  assert.equal(useAppStore.getState().tasks.find((t) => t.id === 't-REFRESH')?.status, 'completed');
  // A background refresh restores authoritative state; the app is never
  // sent through a full re-hydration (loading screen + navigator remount).
  assert.ok(refreshRequests.includes('mutation'));
  assert.equal(hydrationRetryCount, 0);
});

test('APPROVE 4 — RPC success + points refresh FAILS → ok:true, no second approve, background refresh requested (points not synthesized)', async () => {
  seedStore({ id: 't-REFRESH', title: 'r', status: 'needs_attention', assigneeId: 'child-1', householdId: 'hh-R', points: 15 });
  let approveCalls = 0;
  const refreshedRow = sampleTaskRow({ status: 'completed' });
  const r = await approveTaskCompletionSubmission(
    { submissionId: 'sub', taskId: 't-REFRESH', householdId: 'hh-R', role: 'adult' },
    {
      requestRefresh: recordRefresh,
      approveFn:   async () => { approveCalls++; return { data: refreshedRow, error: null } as never; },
      getTasksFn:  async () => ({ data: [refreshedRow], error: null }),
      getPointsFn: async () => ({ data: null, error: pgErr }),
    },
  );
  assert.equal(r.ok, true);
  assert.equal(approveCalls, 1);
  // Tasks refresh DID succeed, so no task-level local mirror / retry from
  // the tasks path. The points-path refresh request must still have fired.
  assert.deepEqual(refreshRequests, ['mutation']);
  assert.equal(hydrationRetryCount, 0);
  // Points are NEVER synthesized on refresh failure.
  assert.equal(useAppStore.getState().pointsBalances.length, 0);
});

// ─── REJECT ──────────────────────────────────────────────────────────────

test('REJECT 5 — V2 reject RPC fails → wrapper returns ok:false, no refresh attempted', async () => {
  seedStore({ id: 't-REFRESH', title: 'r', status: 'needs_attention', assigneeId: 'child-2', householdId: 'hh-R', points: 5 });
  let rejectCalls = 0;
  let getTasksCalls = 0;
  const r = await rejectTaskCompletionSubmission(
    { submissionId: 'sub', taskId: 't-REFRESH', householdId: 'hh-R', role: 'adult' },
    {
      requestRefresh: recordRefresh,
      rejectFn:   async () => { rejectCalls++; return { data: null, error: { code: '28000', message: '', details: '', hint: '' } as PostgrestError }; },
      getTasksFn: async () => { getTasksCalls++; return { data: null, error: pgErr }; },
    },
  );
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'not_authorized');
  assert.equal(rejectCalls, 1);
  assert.equal(getTasksCalls, 0);
  // 28000 is not a stale screen — nothing to refresh.
  assert.deepEqual(refreshRequests, []);
});

test('REJECT 6 — RPC success + task refresh success → ok:true, refreshed tasks applied', async () => {
  seedStore({ id: 't-REFRESH', title: 'r', status: 'needs_attention', assigneeId: 'child-2', householdId: 'hh-R' });
  const refreshedRow = sampleTaskRow({ status: 'open' });
  const r = await rejectTaskCompletionSubmission(
    { submissionId: 'sub', taskId: 't-REFRESH', householdId: 'hh-R', role: 'adult' },
    {
      requestRefresh: recordRefresh,
      rejectFn:   async () => ({ data: refreshedRow, error: null } as never),
      getTasksFn: async () => ({ data: [refreshedRow], error: null }),
    },
  );
  assert.equal(r.ok, true);
  assert.equal(useAppStore.getState().tasks.find((t) => t.id === 't-REFRESH')?.status, 'open');
  assert.equal(hydrationRetryCount, 0);
  assert.deepEqual(refreshRequests, []);
});

test('REJECT 7 — RPC success + task refresh FAILS → ok:true, local status mirrored to open, background refresh requested, NO second reject', async () => {
  seedStore({ id: 't-REFRESH', title: 'r', status: 'needs_attention', assigneeId: 'child-2', householdId: 'hh-R' });
  let rejectCalls = 0;
  const r = await rejectTaskCompletionSubmission(
    { submissionId: 'sub', taskId: 't-REFRESH', householdId: 'hh-R', role: 'adult' },
    {
      requestRefresh: recordRefresh,
      rejectFn:   async () => { rejectCalls++; return { data: sampleTaskRow({ status: 'open' }), error: null } as never; },
      getTasksFn: async () => ({ data: null, error: pgErr }),
    },
  );
  assert.equal(r.ok, true);
  assert.equal(rejectCalls, 1);
  assert.equal(useAppStore.getState().tasks.find((t) => t.id === 't-REFRESH')?.status, 'open');
  assert.ok(refreshRequests.includes('mutation'));
  assert.equal(hydrationRetryCount, 0);
});

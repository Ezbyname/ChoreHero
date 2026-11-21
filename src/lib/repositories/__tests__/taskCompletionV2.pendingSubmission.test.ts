// Configured-client coverage for getPendingTaskCompletionSubmissionForTask
// — the public repository function with no caller-controlled fields. This
// test file runs in its own child process (node --test default isolation
// = process per file), so setting EXPO_PUBLIC_SUPABASE_* here cannot leak
// into other test files. The dynamic imports below trigger first-eval of
// @/lib/supabase inside this process with configured-env values in place,
// so `supabase` becomes non-null; we then monkey-patch `supabase.from`
// on that instantiated client to record the exact builder chain and feed
// deterministic results — exactly mirrors the established evidenceFetch
// test file's own strategy (globalThis.fetch monkey-patch on the module-
// level client; same pattern, different Supabase surface).

import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Deterministic test-only env values — not real credentials, not QA, not
// Production. Only exist so supabaseConfig resolves `isSupabaseConfigured
// === true` and the module-level supabase client instantiates inside this
// isolated test process.
const TEST_SUPABASE_URL      = 'https://test.example.supabase.co';
const TEST_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';
process.env.EXPO_PUBLIC_SUPABASE_URL      = TEST_SUPABASE_URL;
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = TEST_SUPABASE_ANON_KEY;

// Dynamic imports AFTER env setup — static @/ imports would be ESM-hoisted
// above the env assignments and defeat the setup.
const { getPendingTaskCompletionSubmissionForTask } =
  await import('@/lib/repositories/taskCompletionV2');
const { supabase } = await import('@/lib/supabase');
if (!supabase) {
  throw new Error('test setup failed: expected supabase to be non-null in configured mode');
}

// ─── Monkey-patch harness for `supabase.from` ────────────────────────────
type BuilderCall = { method: 'from' | 'select' | 'eq' | 'maybeSingle' | 'single' | 'limit'; args: unknown[] };
let calls: BuilderCall[] = [];
let maybeSingleResult: { data: unknown; error: unknown } = { data: null, error: null };

const originalFrom = (supabase.from as unknown) as (table: string) => unknown;
function installFromMock(): void {
  (supabase as unknown as { from: unknown }).from = (table: string) => {
    calls.push({ method: 'from', args: [table] });
    const chain: Record<string, unknown> = {
      select(cols: string) { calls.push({ method: 'select', args: [cols] }); return chain; },
      eq(col: string, val: unknown) { calls.push({ method: 'eq', args: [col, val] }); return chain; },
      // Record forbidden terminators so tests can assert the chain uses
      // maybeSingle() and nothing else that would fetch an array or throw.
      single: async () => { calls.push({ method: 'single', args: [] }); return maybeSingleResult; },
      limit(n: number) { calls.push({ method: 'limit', args: [n] }); return chain; },
      maybeSingle: async () => { calls.push({ method: 'maybeSingle', args: [] }); return maybeSingleResult; },
    };
    return chain;
  };
}
function restoreFromMock(): void {
  (supabase as unknown as { from: unknown }).from = originalFrom;
}

beforeEach(() => { calls = []; maybeSingleResult = { data: null, error: null }; installFromMock(); });
afterEach(() => { restoreFromMock(); });
after(() => { restoreFromMock(); });

// Minimal fake row — fields covered are the ones the UI boundary actually
// uses (the repository returns the row unchanged, so additional columns
// don't need to be present for behavior correctness).
const sampleRow = {
  id:                      'sub-abc-123',
  task_id:                 't-xyz-789',
  household_id:            'hh-456',
  submitted_by_profile_id: 'child-1',
  client_request_id:       'cri-1',
  photo_storage_path:      null,
  status:                  'pending',
  reviewed_by_profile_id:  null,
  reviewed_at:             null,
  submitted_at:            '2026-10-02T12:00:00.000Z',
  created_at:              '2026-10-02T12:00:00.000Z',
  updated_at:              '2026-10-02T12:00:00.000Z',
};

// 1. Matching row — the configured client returns one pending submission.
test('returns the exact row when a pending submission exists for the task', async () => {
  maybeSingleResult = { data: sampleRow, error: null };
  const r = await getPendingTaskCompletionSubmissionForTask('t-xyz-789');
  assert.equal(r.error, null);
  assert.deepEqual(r.data, sampleRow);
});

// 2. No matching row — maybeSingle() returns data: null, error: null.
test('returns data: null, error: null when no pending submission exists', async () => {
  maybeSingleResult = { data: null, error: null };
  const r = await getPendingTaskCompletionSubmissionForTask('t-missing');
  assert.equal(r.data, null);
  assert.equal(r.error, null);
});

// 3. Exact task filter — eq(task_id, requested) uses the input unchanged.
test('applies .eq(task_id, requestedTaskId) with the exact input', async () => {
  const requested = 'some-exact-uuid-abcdef';
  await getPendingTaskCompletionSubmissionForTask(requested);
  const taskIdEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'task_id');
  assert.ok(taskIdEq, '.eq(task_id, …) call missing');
  assert.equal(taskIdEq.args[1], requested);
});

// 4. Pending-status filter — must constrain to status = 'pending'.
test('applies .eq(status, pending)', async () => {
  await getPendingTaskCompletionSubmissionForTask('t-irrelevant');
  const statusEq = calls.find((c) => c.method === 'eq' && c.args[0] === 'status');
  assert.ok(statusEq, '.eq(status, …) call missing — query would retrieve all statuses');
  assert.equal(statusEq.args[1], 'pending');
});

// 5. Repository error — propagated through unchanged, no throw.
test('propagates a PostgREST-shaped error without throwing', async () => {
  const err = { code: 'PGRST500', message: 'db offline', details: '', hint: '' };
  maybeSingleResult = { data: null, error: err };
  let threw = false;
  let r;
  try {
    r = await getPendingTaskCompletionSubmissionForTask('t-x');
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'repository must not throw on PostgREST error');
  assert.equal(r!.data, null);
  assert.deepEqual(r!.error, err);
});

// 6. maybeSingle contract — chain must terminate with .maybeSingle(), not
//    .single() or .limit(1). The schema's partial unique index
//    uq_tcs_one_pending_per_task guarantees 0 or 1 rows; maybeSingle is
//    the correct terminator (returns null-or-row, never throws for 0 rows).
test('terminates with .maybeSingle() — not .single() or .limit() + array selection', async () => {
  await getPendingTaskCompletionSubmissionForTask('t-x');
  const methods = calls.map((c) => c.method);
  assert.equal(methods.includes('maybeSingle'), true, 'expected .maybeSingle() in chain');
  assert.equal(methods.includes('single'),      false, 'unexpected .single() — would throw on 0 rows');
  assert.equal(methods.includes('limit'),       false, 'unexpected .limit() — not required and signals array-based terminator');
});

// 7. Full chain shape — exact order and selected columns.
test('builds the exact chain: from(task_completion_submissions).select(*).eq(task_id).eq(status).maybeSingle()', async () => {
  await getPendingTaskCompletionSubmissionForTask('t-x');
  const methodNames = calls.map((c) => c.method);
  assert.deepEqual(methodNames, ['from', 'select', 'eq', 'eq', 'maybeSingle']);
  assert.equal(calls[0].args[0], 'task_completion_submissions');
  assert.equal(calls[1].args[0], '*');
});

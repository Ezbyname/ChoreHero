// Create Task: one tap = one task, visible success / failure, and a
// committed insert is never reported as a failure (that invited a retry
// that created the task twice). Configured mode with fake repositories.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.EXPO_PUBLIC_SUPABASE_URL      = 'https://test.example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';

const { createTask } = await import('@/features/tasks/createTask');
const form           = await import('@/features/tasks/createTaskFormState');
const { useAppStore } = await import('@/store/useAppStore');
import type { PostgrestError } from '@supabase/supabase-js';

const row = (id: string, title: string) => ({
  id, household_id: 'hh', title, description: null, status: 'open' as const, created_by_profile_id: 'adult-1',
  assigned_by_profile_id: null, assignee_profile_id: null, due_at: null, due_at_has_time: null, points: 0,
  source_service_request_id: null, completed_at: null, completed_by_profile_id: null,
  created_at: '2026-10-30T10:00:00Z', updated_at: '2026-10-30T10:00:00Z',
});
const pgErr = { code: 'PGRST500', message: 'x', details: '', hint: '' } as PostgrestError;
const input = { householdId: 'hh', title: 'Water plants', createdByProfileId: 'adult-1', role: 'adult' };

test('double tap: the single-flight guard runs createTask exactly once', async () => {
  const run = form.createSingleFlight();
  let inserts = 0;
  let release!: () => void;
  const slow = () => new Promise<void>((r) => { inserts++; release = r; });
  const first  = run(slow);
  const second = run(slow);
  assert.equal(await second, undefined);
  release();
  await first;
  assert.equal(inserts, 1);
  // After it finished, a new tap works again.
  await run(async () => { inserts++; });
  assert.equal(inserts, 2);
});

test('form state: submitting blocks Create; success names the task and resets; failure keeps input', () => {
  assert.equal(form.canSubmitCreateTask(form.INITIAL_CREATE_PHASE), true);
  assert.equal(form.canSubmitCreateTask(form.onCreateTaskStarted()), false);
  const ok = form.onCreateTaskResult({ ok: true }, '  Water plants ');
  assert.deepEqual(ok, { kind: 'created', title: 'Water plants' });
  assert.equal(form.shouldResetCreateForm(ok), true);
  const failed = form.onCreateTaskResult({ ok: false, reason: 'failed' }, 'x');
  assert.deepEqual(failed, { kind: 'failed' });
  assert.equal(form.shouldResetCreateForm(failed), false);
  assert.deepEqual(form.onCreateTaskThrew(), { kind: 'failed' });
  assert.deepEqual(form.onCreateTaskEdited(ok), form.INITIAL_CREATE_PHASE);
  assert.deepEqual(form.onCreateTaskEdited(form.onCreateTaskStarted()), { kind: 'submitting' });
});

test('success: the new task is in the store right away (Assigned shows it immediately)', async () => {
  useAppStore.setState({ tasks: [] });
  const r = await createTask(input, {
    insertFn:   async () => ({ data: row('t-new', 'Water plants'), error: null }),
    getTasksFn: async () => ({ data: [row('t-new', 'Water plants')], error: null }),
    requestRefresh: () => undefined,
  });
  assert.deepEqual(r, { ok: true });
  assert.equal(useAppStore.getState().tasks[0]?.id, 't-new');
  assert.equal(useAppStore.getState().tasks[0]?.createdAt, '2026-10-30T10:00:00Z');
});

test('insert ok but the list refresh fails: still ok (no duplicate on retry), row shown, background refresh asked', async () => {
  useAppStore.setState({ tasks: [{ id: 'old', title: 'old', status: 'open' }] });
  const refresh: string[] = [];
  let inserts = 0;
  const r = await createTask(input, {
    insertFn:   async () => { inserts++; return { data: row('t-new', 'Water plants'), error: null }; },
    getTasksFn: async () => ({ data: null, error: pgErr }),
    requestRefresh: (reason) => { refresh.push(reason); },
  });
  assert.deepEqual(r, { ok: true });
  assert.equal(inserts, 1);
  assert.deepEqual(useAppStore.getState().tasks.map((t) => t.id), ['t-new', 'old']);
  assert.deepEqual(refresh, ['mutation']);
});

test('insert failure: reported as failed, nothing added', async () => {
  useAppStore.setState({ tasks: [] });
  const r = await createTask(input, {
    insertFn:   async () => ({ data: null, error: pgErr }),
    getTasksFn: async () => { throw new Error('must not refetch'); },
  });
  assert.deepEqual(r, { ok: false, reason: 'failed' });
  assert.equal(useAppStore.getState().tasks.length, 0);
});

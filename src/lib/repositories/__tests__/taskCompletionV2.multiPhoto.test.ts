// Configured-client coverage for the multi-photo repository surface:
//   - requestTaskCompletionV3 sends exactly { p_task_id, p_client_request_id,
//     p_photo_object_ids } to request_task_completion_v3;
//   - fetchTaskCompletionEvidence(id, index) adds photo_index ONLY for
//     photos 2..5 (photo 1 keeps the exact body every deployed Edge Function
//     version accepts) and never sends a path;
//   - getTaskSubmissionSummariesForHousehold reads metadata only (never
//     photo_storage_path when photo_count exists) and degrades to 0/1 on a
//     backend that predates the multi-photo migration.
// Own child process (node --test isolation), test-only env values.

import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.EXPO_PUBLIC_SUPABASE_URL      = 'https://test.example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';

const repo = await import('@/lib/repositories/taskCompletionV2');
const { supabase } = await import('@/lib/supabase');
if (!supabase) throw new Error('test setup failed: expected a configured client');

const client = supabase as unknown as Record<string, unknown> & { auth: Record<string, unknown> };
const original = { rpc: client.rpc, from: client.from, getSession: client.auth.getSession, fetch: globalThis.fetch };
after(() => {
  client.rpc = original.rpc;
  client.from = original.from;
  client.auth.getSession = original.getSession;
  globalThis.fetch = original.fetch;
});

let rpcCalls: Array<{ fn: string; args: unknown }> = [];
let fetchBodies: unknown[] = [];
let selects: string[] = [];
let selectResults: Array<{ data: unknown; error: unknown }> = [];

beforeEach(() => {
  rpcCalls = []; fetchBodies = []; selects = []; selectResults = [];
  client.rpc = async (fn: string, args: unknown) => { rpcCalls.push({ fn, args }); return { data: { id: 's-1' }, error: null }; };
  client.auth.getSession = async () => ({ data: { session: { access_token: 'tok' } }, error: null });
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    fetchBodies.push(JSON.parse(String(init?.body)));
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  }) as typeof fetch;
  client.from = (table: string) => {
    assert.equal(table, 'task_completion_submissions');
    const chain: Record<string, unknown> = {
      select(cols: string) { selects.push(cols); return chain; },
      eq() { return chain; },
      order() { return chain; },
      limit: async () => selectResults.shift() ?? { data: [], error: null },
    };
    return chain;
  };
});

test('requestTaskCompletionV3 calls request_task_completion_v3 with the ordered ids and nothing else', async () => {
  const r = await repo.requestTaskCompletionV3({ taskId: 't-1', clientRequestId: 'k-1', photoObjectIds: ['a', 'b', 'c'] });
  assert.equal(r.error, null);
  assert.deepEqual(rpcCalls, [{
    fn: 'request_task_completion_v3',
    args: { p_task_id: 't-1', p_client_request_id: 'k-1', p_photo_object_ids: ['a', 'b', 'c'] },
  }]);
});

test('evidence fetch: photo 1 keeps the legacy { submission_id } body; photos 2..5 add only photo_index', async () => {
  await repo.fetchTaskCompletionEvidence('sub-1');
  await repo.fetchTaskCompletionEvidence('sub-1', 0);
  await repo.fetchTaskCompletionEvidence('sub-1', 3);
  assert.deepEqual(fetchBodies, [
    { submission_id: 'sub-1' },
    { submission_id: 'sub-1' },
    { submission_id: 'sub-1', photo_index: 3 },
  ]);
  for (const b of fetchBodies) assert.ok(!JSON.stringify(b).includes('/'), 'no path ever sent');
});

test('summaries: metadata columns + photo_count, never photo_storage_path', async () => {
  selectResults.push({ data: [{ id: 's', task_id: 't', status: 'pending', submitted_by_profile_id: 'c', submitted_at: 'x', reviewed_at: null, photo_count: 4 }], error: null });
  const r = await repo.getTaskSubmissionSummariesForHousehold('hh-1');
  assert.equal(selects.length, 1);
  assert.ok(selects[0].includes('photo_count'));
  assert.ok(!selects[0].includes('photo_storage_path'));
  assert.equal(r.data?.[0].photo_count, 4);
});

test('summaries on a pre-migration backend (42703): falls back to 0/1 and drops the path before returning', async () => {
  selectResults.push({ data: null, error: { code: '42703', message: 'column photo_count does not exist' } });
  selectResults.push({ data: [
    { id: 's1', task_id: 't1', status: 'pending', submitted_by_profile_id: 'c', submitted_at: 'x', reviewed_at: null, photo_storage_path: 'hh/t1/c/o1' },
    { id: 's2', task_id: 't2', status: 'approved', submitted_by_profile_id: 'c', submitted_at: 'y', reviewed_at: 'z', photo_storage_path: null },
  ], error: null });
  const r = await repo.getTaskSubmissionSummariesForHousehold('hh-1');
  assert.deepEqual(r.data?.map((x) => x.photo_count), [1, 0]);
  assert.ok(!JSON.stringify(r.data).includes('hh/t1'));
});

test('summaries: any other error is returned, not swallowed', async () => {
  selectResults.push({ data: null, error: { code: 'PGRST500', message: 'down' } });
  const r = await repo.getTaskSubmissionSummariesForHousehold('hh-1');
  assert.equal(r.data, null);
  assert.equal((r.error as { code: string }).code, 'PGRST500');
});

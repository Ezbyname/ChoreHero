import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approveTaskCompletionV2,
  fetchTaskCompletionEvidence,
  rejectTaskCompletionV2,
  requestTaskCompletionV2,
} from '@/lib/repositories/taskCompletionV2';

// Mock-mode coverage only — isSupabaseConfigured is false in this test
// environment (no EXPO_PUBLIC_SUPABASE_* env vars are set, matching every
// other test in this repository), so `supabase` is null and each function's
// only reachable branch is its `if (!supabase)` guard. No repository file
// in this codebase has a mocking seam for the real RPC/Edge-Function-calling
// branch — this is the same limitation every other repository function has,
// not something unique to this file.

test('requestTaskCompletionV2 returns notConfiguredError without throwing when Supabase is not configured', async () => {
  const result = await requestTaskCompletionV2({
    taskId:          'task-1',
    clientRequestId: 'cri-1',
  });

  assert.equal(result.data, null);
  assert.equal(result.error?.code, 'PGRST_NOT_CONFIGURED');
});

test('approveTaskCompletionV2 returns notConfiguredError without throwing when Supabase is not configured', async () => {
  const result = await approveTaskCompletionV2('submission-1');

  assert.equal(result.data, null);
  assert.equal(result.error?.code, 'PGRST_NOT_CONFIGURED');
});

test('rejectTaskCompletionV2 returns notConfiguredError without throwing when Supabase is not configured', async () => {
  const result = await rejectTaskCompletionV2('submission-1');

  assert.equal(result.data, null);
  assert.equal(result.error?.code, 'PGRST_NOT_CONFIGURED');
});

test('fetchTaskCompletionEvidence returns notConfiguredError without throwing when Supabase is not configured', async () => {
  const result = await fetchTaskCompletionEvidence('submission-1');

  assert.equal(result.data, null);
  assert.equal(result.error?.code, 'PGRST_NOT_CONFIGURED');
});

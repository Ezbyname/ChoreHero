// A reviewer Modal opened BEFORE the child withdrew: the next Approve or
// Reject hits CH017 on the server (proven at SQL level against the real
// migrations — no points awarded). Client side, that must land in the
// existing terminal "not pending" state: no success, no direct refetch, no
// retry — and ONE background 'stale' refresh, so the stale card disappears
// from the reviewer's lists even if the Realtime event was missed.
// Configured mode, fake repository functions (same pattern as
// approveTaskCompletionSubmission.refresh.test.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.EXPO_PUBLIC_SUPABASE_URL      = 'https://test.example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';

const { approveTaskCompletionSubmission } = await import('@/features/tasks/approveTaskCompletionSubmission');
const { rejectTaskCompletionSubmission }  = await import('@/features/tasks/rejectTaskCompletionSubmission');
const ui                                  = await import('@/features/tasks/components/taskReviewEvidenceUiState');
const { useAppStore }                     = await import('@/store/useAppStore');
import type { PostgrestError } from '@supabase/supabase-js';

const CH017 = { code: 'CH017', message: 'Submission is not pending review', details: '', hint: '' } as PostgrestError;
const input = { submissionId: 'sub-WITHDRAWN', taskId: 't-1', householdId: 'hh-1', role: 'owner' };

function readyReviewState() {
  const s = ui.onContextLoaded(ui.initialReviewState('approve'), {
    submissionId: 'sub-WITHDRAWN', taskId: 't-1', submittedByProfileId: 'child-1',
    submittedAt: '2026-10-29T00:00:00Z', hasPhoto: false,
  });
  assert.equal(ui.canConfirmDecision(s), true);
  return s;
}

test('stale Approve after withdrawal -> not_pending, stale refresh requested, no points change, terminal UI', async () => {
  useAppStore.setState({ pointsBalances: [{ userId: 'child-1', householdId: 'hh-1', balance: 3 }] });
  let refreshCalls = 0;
  const requested: string[] = [];
  const r = await approveTaskCompletionSubmission(input, {
    approveFn:   async () => ({ data: null, error: CH017 }),
    getTasksFn:  async () => { refreshCalls++; return { data: [], error: null }; },
    getPointsFn: async () => { refreshCalls++; return { data: [], error: null }; },
    requestRefresh: (reason) => { requested.push(reason); },
  });
  assert.deepEqual(r, { ok: false, reason: 'not_pending' });
  assert.equal(refreshCalls, 0);
  assert.deepEqual(requested, ['stale']);
  assert.equal(useAppStore.getState().pointsBalances[0].balance, 3);

  const after = ui.onActionNotPending(ui.onBeginApprove(readyReviewState())!);
  assert.equal(ui.isTerminalPhase(after), true);
  assert.equal(ui.canConfirmDecision(after), false);
});

test('stale Reject after withdrawal -> not_pending, stale refresh requested, terminal UI', async () => {
  const requested: string[] = [];
  const r = await rejectTaskCompletionSubmission(input, {
    rejectFn:   async () => ({ data: null, error: CH017 }),
    getTasksFn: async () => ({ data: [], error: null }),
    requestRefresh: (reason) => { requested.push(reason); },
  });
  assert.deepEqual(r, { ok: false, reason: 'not_pending' });
  assert.deepEqual(requested, ['stale']);
});

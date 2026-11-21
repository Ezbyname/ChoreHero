// P0-1 (Phase 2): the "gone" dead end. The child's card still said "Waiting
// for review", but the adult had already decided: opening it showed "gone"
// and nothing ever refreshed, so the card — and the same dead end — stayed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.EXPO_PUBLIC_SUPABASE_URL      = 'https://test.example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';

const { getChildPendingCompletion, withdrawChildPendingCompletion } = await import('@/features/tasks/childPendingCompletion');
const { onPendingLoadResult }   = await import('@/features/tasks/components/pendingCompletionUiState');
const { refreshHouseholdData }  = await import('@/features/sync/householdRefresh');
const { TaskAdapter }           = await import('@/domain/adapters/taskActivityAdapter');
const { applyViewerTaskActions } = await import('@/features/tasks/taskViewerActions');
const { deriveTaskStatus, latestSubmissionByTask } = await import('@/features/tasks/taskListSections');
const { useAppStore }           = await import('@/store/useAppStore');
import type { PostgrestError } from '@supabase/supabase-js';
import type { TaskCompletionSubmissionRow } from '@/types/supabase';

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const pg = (c: string) => ({ code: c, message: c, details: '', hint: '' }) as PostgrestError;

function recorder() {
  const reasons: string[] = [];
  return { reasons, requestRefresh: (r: string) => { reasons.push(r); } };
}

test('OLD FAILURE -> FIX: opening an already-decided pending completion (not_found) requests a stale refresh', async () => {
  const r = recorder();
  const result = await getChildPendingCompletion(
    { taskId: 't-1', role: 'child' },
    { getPendingFn: async () => ({ data: null, error: null }), requestRefresh: r.requestRefresh },
  );
  assert.deepEqual(result, { ok: false, reason: 'not_found' });
  assert.deepEqual(r.reasons, ['stale']);
  // ...and the sheet shows the friendly "gone" state, not an error.
  assert.deepEqual(onPendingLoadResult('not_found'), { phase: 'gone' });
});

test('a real pending submission or a transient error does NOT trigger the stale refresh', async () => {
  const r = recorder();
  const row = { id: 'sub-1', photo_storage_path: null, photo_count: 0 } as unknown as TaskCompletionSubmissionRow;
  await getChildPendingCompletion({ taskId: 't-1', role: 'child' }, { getPendingFn: async () => ({ data: row, error: null }), requestRefresh: r.requestRefresh });
  await getChildPendingCompletion({ taskId: 't-1', role: 'child' }, { getPendingFn: async () => ({ data: null, error: pg('PGRST500') }), requestRefresh: r.requestRefresh });
  await getChildPendingCompletion({ taskId: 't-1', role: 'owner' }, { getPendingFn: async () => ({ data: null, error: null }), requestRefresh: r.requestRefresh });
  assert.deepEqual(r.reasons, []);
});

test('withdraw that the server says is no longer pending (CH017) requests the stale refresh too', async () => {
  const r = recorder();
  const result = await withdrawChildPendingCompletion(
    { submissionId: 'sub-1', taskId: 't-1', householdId: 'hh-1', role: 'child' },
    { withdrawFn: async () => ({ data: null, error: pg('CH017') }), requestRefresh: r.requestRefresh },
  );
  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
  assert.deepEqual(r.reasons, ['stale']);
});

test('the production sheet uses the refreshing lookup, and a "gone" sheet can always be closed', () => {
  const modal = code('../components/PendingCompletionModal.tsx');
  assert.ok(modal.includes('await getChildPendingCompletion({ taskId, role });'), 'default deps = real household refresh');
  // Close is blocked only while a withdraw is waiting for the server.
  assert.ok(/function handleClose\(\) \{\s*if \(state\.phase === 'withdrawing'\) return;/.test(modal));
});

test('after the refresh, the card shows the REAL backend state and is actionable again (no dead end)', async () => {
  useAppStore.setState({
    activeHouseholdId: 'hh-1', isAppDataReady: true, appHydrationState: 'hydrated',
    tasks: [{ id: 't-1', title: 'Dishes', status: 'needs_attention', householdId: 'hh-1', assigneeId: 'child-1' }],
    taskSubmissions: [], contributionClaims: [], rewardRedemptions: [], rewards: [], pointsBalances: [],
  });
  const viewer = { canApproveTaskCompletion: false, viewerId: 'child-1', role: 'child' };
  const before = applyViewerTaskActions(TaskAdapter.toFamilyActivity(useAppStore.getState().tasks[0]), viewer);
  assert.deepEqual(before.availableActions, ['manage_completion'], 'stale card: leads to the pending sheet');

  // Server state after the adult rejected: task open, latest submission rejected.
  const ok = <T,>(data: T) => async () => ({ data, error: null });
  assert.equal(await refreshHouseholdData({
    getTasks: ok([{ id: 't-1', household_id: 'hh-1', created_by_profile_id: 'owner-1', assignee_profile_id: 'child-1',
      title: 'Dishes', description: null, due_at: null, due_at_has_time: null, status: 'open', points: 5 }]),
    getRewards: ok([]), getPoints: ok([]), getClaims: ok([]), getRedemptions: ok([]),
    getSubmissions: ok([{ id: 'sub-1', task_id: 't-1', status: 'rejected', submitted_by_profile_id: 'child-1',
      submitted_at: '2026-11-02T10:00:00Z', reviewed_at: '2026-11-02T10:01:00Z', photo_count: 0 }]),
    isConfigured: true,
  } as never), 'applied');

  const s = useAppStore.getState();
  const after = applyViewerTaskActions(TaskAdapter.toFamilyActivity(s.tasks[0]), viewer);
  assert.deepEqual(after.availableActions, ['complete'], 'child can send it again');
  assert.equal(deriveTaskStatus(s.tasks[0], latestSubmissionByTask(s.taskSubmissions).get('t-1')).key, 'needs_retry');
});

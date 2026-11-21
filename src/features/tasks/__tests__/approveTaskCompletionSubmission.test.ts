import assert from 'node:assert/strict';
import test from 'node:test';

import { approveTaskCompletionSubmission } from '@/features/tasks/approveTaskCompletionSubmission';
import { rejectTaskCompletionSubmission }  from '@/features/tasks/rejectTaskCompletionSubmission';
import { useAppStore } from '@/store/useAppStore';
import type { Task } from '@/types';

// Mock-mode coverage — isSupabaseConfigured=false here. The real V2 RPC
// path is covered by the repository tests in taskCompletionV2.test.ts and
// by the live QA campaign that already closed.

function seedTaskInStore(task: Task): void {
  useAppStore.setState({ tasks: [task], pointsBalances: [] });
}

test('approveTaskCompletionSubmission rejects a child role at the permission gate', async () => {
  const r = await approveTaskCompletionSubmission({
    submissionId: 'sub', taskId: 't', householdId: 'hh', role: 'child',
  });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'not_authorized');
});

test('rejectTaskCompletionSubmission rejects a child role at the permission gate', async () => {
  const r = await rejectTaskCompletionSubmission({
    submissionId: 'sub', taskId: 't', householdId: 'hh', role: 'child',
  });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'not_authorized');
});

test('approveTaskCompletionSubmission mock-mode: needs_attention → completed, points awarded to assignee', async () => {
  seedTaskInStore({
    id: 'tA', title: 'a', status: 'needs_attention',
    assigneeId: 'child-1', householdId: 'hhA', points: 10,
  });
  const r = await approveTaskCompletionSubmission({
    submissionId: 'subA', taskId: 'tA', householdId: 'hhA', role: 'adult',
  });
  assert.equal(r.ok, true);
  const { tasks, pointsBalances } = useAppStore.getState();
  assert.equal(tasks.find((t) => t.id === 'tA')?.status, 'completed');
  const bal = pointsBalances.find((b) => b.userId === 'child-1');
  assert.equal(bal?.balance, 10);
});

test('approveTaskCompletionSubmission mock-mode returns not_pending when task is not needs_attention', async () => {
  seedTaskInStore({ id: 'tB', title: 'b', status: 'open' });
  const r = await approveTaskCompletionSubmission({
    submissionId: 'subB', taskId: 'tB', householdId: 'hh', role: 'adult',
  });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'not_pending');
});

test('rejectTaskCompletionSubmission mock-mode: needs_attention → open (points untouched)', async () => {
  seedTaskInStore({
    id: 'tC', title: 'c', status: 'needs_attention',
    assigneeId: 'child-2', householdId: 'hhC', points: 20,
  });
  const r = await rejectTaskCompletionSubmission({
    submissionId: 'subC', taskId: 'tC', householdId: 'hhC', role: 'owner',
  });
  assert.equal(r.ok, true);
  const { tasks, pointsBalances } = useAppStore.getState();
  assert.equal(tasks.find((t) => t.id === 'tC')?.status, 'open');
  // Reject never awards points.
  assert.equal(pointsBalances.length, 0);
});

test('rejectTaskCompletionSubmission mock-mode returns not_pending when task is not needs_attention', async () => {
  seedTaskInStore({ id: 'tD', title: 'd', status: 'completed' });
  const r = await rejectTaskCompletionSubmission({
    submissionId: 'subD', taskId: 'tD', householdId: 'hh', role: 'adult',
  });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'not_pending');
});

test('owner/admin/adult all pass the approve permission gate', async () => {
  for (const role of ['owner', 'admin', 'adult'] as const) {
    seedTaskInStore({
      id: 'tR', title: 'r', status: 'needs_attention',
      assigneeId: 'child-x', householdId: 'hhR', points: 1,
    });
    const r = await approveTaskCompletionSubmission({
      submissionId: 'subR', taskId: 'tR', householdId: 'hhR', role,
    });
    assert.equal(r.ok, true, `role=${role}`);
  }
});

// Mutation-vs-refresh scenarios (which require the real-mode branch where
// isSupabaseConfigured=true) live in a sibling test file that sets EXPO_PUBLIC
// env BEFORE first-eval + injects fake repository deps:
//   approveTaskCompletionSubmission.refresh.test.ts
// Same pattern as taskCompletionV2.pendingSubmission.test.ts and
// taskCompletionV2.evidenceFetch.test.ts.

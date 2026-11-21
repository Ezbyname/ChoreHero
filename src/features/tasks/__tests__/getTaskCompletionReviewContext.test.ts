import assert from 'node:assert/strict';
import test from 'node:test';

import { getTaskCompletionReviewContext } from '@/features/tasks/getTaskCompletionReviewContext';
import { useAppStore } from '@/store/useAppStore';
import type { Task } from '@/types';

// Mock-mode coverage only — isSupabaseConfigured is false in this test
// environment (no EXPO_PUBLIC_SUPABASE_* env vars), matching every other
// test file in this repository. Real-mode behavior is validated by the
// repository-layer test below plus the already-shipped live QA for the
// read API.

function seedTaskInStore(task: Task): void {
  useAppStore.setState({ tasks: [task] });
}

test('getTaskCompletionReviewContext rejects when the role lacks tasks.approve_completion', async () => {
  const result = await getTaskCompletionReviewContext({ taskId: 'any', role: 'child' });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'not_authorized');
});

test('getTaskCompletionReviewContext returns not_found when no needs_attention task matches (mock mode)', async () => {
  seedTaskInStore({ id: 'task-x', title: 'x', status: 'open' });
  const result = await getTaskCompletionReviewContext({ taskId: 'task-x', role: 'adult' });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'not_found');
});

test('getTaskCompletionReviewContext returns a mock context for a needs_attention task in mock mode (hasPhoto=false)', async () => {
  seedTaskInStore({
    id: 'task-y', title: 'y', status: 'needs_attention',
    assigneeId: 'child-7', householdId: 'hh-1',
  });
  const result = await getTaskCompletionReviewContext({ taskId: 'task-y', role: 'adult' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.taskId, 'task-y');
  assert.equal(result.data.submittedByProfileId, 'child-7');
  // Mock mode never produces real Storage objects — hasPhoto must be false
  // so the Modal never attempts an evidence fetch while running against mocks.
  assert.equal(result.data.hasPhoto, false);
  assert.equal(result.data.submissionId.startsWith('mock-submission-'), true);
  // Reviewer-facing context never includes a Storage path field.
  assert.equal(('photo_storage_path' in (result.data as unknown as Record<string, unknown>)), false);
});

test('getTaskCompletionReviewContext owner/admin/adult all pass the permission gate (child rejected)', async () => {
  seedTaskInStore({
    id: 'task-z', title: 'z', status: 'needs_attention',
    assigneeId: 'child-9',
  });
  for (const role of ['owner', 'admin', 'adult'] as const) {
    const r = await getTaskCompletionReviewContext({ taskId: 'task-z', role });
    assert.equal(r.ok, true, `role=${role}`);
  }
  const rChild = await getTaskCompletionReviewContext({ taskId: 'task-z', role: 'child' });
  assert.equal(rChild.ok, false);
  assert.equal(!rChild.ok && rChild.reason, 'not_authorized');
});

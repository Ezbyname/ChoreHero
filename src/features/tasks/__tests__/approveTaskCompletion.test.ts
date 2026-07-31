import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { approveTaskCompletion } from '@/features/tasks/approveTaskCompletion';
import { useAppStore } from '@/store/useAppStore';
import type { Task } from '@/types';

function seedTask(overrides: Partial<Task>): void {
  useAppStore.getState().setTasks([
    {
      id:         'task-1',
      title:      'Test task',
      status:     'needs_attention',
      assigneeId: 'child-1',
      ...overrides,
    },
  ]);
}

afterEach(() => {
  useAppStore.getState().resetAppState();
});

// role: null has no permissions at all, so this exercises the permission
// gate without reaching Supabase/mock-store I/O.
test('missing tasks.approve_completion permission returns not_authorized without touching the repository', async () => {
  const result = await approveTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        null,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

// child has neither tasks.approve_completion nor tasks.reject_completion —
// review is privileged-only (owner/admin/adult), per EX-07.
test('child role is not authorized to approve a completion request', async () => {
  const result = await approveTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        'child',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

// Approved happy path (mock-mode: isSupabaseConfigured is false in this
// environment). completed_by_profile_id semantics are enforced server-side
// by the RPC in real mode; the mock branch only models the status
// transition, matching completeTask.ts's own mock-mode scope.
test('adult can approve a needs_attention task, transitioning it to completed', async () => {
  seedTask({ status: 'needs_attention', assigneeId: 'child-1' });

  const result = await approveTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        'adult',
  });

  assert.deepEqual(result, { ok: true });
  const task = useAppStore.getState().tasks.find((t) => t.id === 'task-1');
  assert.equal(task?.status, 'completed');
});

// A task that is not (or no longer) needs_attention cannot be approved —
// mirrors complete_task's/request_task_completion's own not-open handling.
test('an open task cannot be approved', async () => {
  seedTask({ status: 'open', assigneeId: 'child-1' });

  const result = await approveTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

test('an already-completed task cannot be approved again', async () => {
  seedTask({ status: 'completed', assigneeId: 'child-1' });

  const result = await approveTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { rejectTaskCompletion } from '@/features/tasks/rejectTaskCompletion';
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

test('missing tasks.reject_completion permission returns not_authorized without touching the repository', async () => {
  const result = await rejectTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        null,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('child role is not authorized to reject a completion request', async () => {
  const result = await rejectTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        'child',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

// Reject returns the task to 'open' and leaves assigneeId unchanged — the
// task remains the same child's to retry, matching the contract's §8
// reject-behavior text exactly.
test('adult can reject a needs_attention task, returning it to open with the same assignee', async () => {
  seedTask({ status: 'needs_attention', assigneeId: 'child-1' });

  const result = await rejectTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        'adult',
  });

  assert.deepEqual(result, { ok: true });
  const task = useAppStore.getState().tasks.find((t) => t.id === 'task-1');
  assert.equal(task?.status, 'open');
  assert.equal(task?.assigneeId, 'child-1');
});

test('an open task cannot be rejected', async () => {
  seedTask({ status: 'open', assigneeId: 'child-1' });

  const result = await rejectTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

test('an already-completed task cannot be rejected', async () => {
  seedTask({ status: 'completed', assigneeId: 'child-1' });

  const result = await rejectTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

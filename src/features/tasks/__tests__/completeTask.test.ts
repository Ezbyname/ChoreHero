import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { completeTask } from '@/features/tasks/completeTask';
import { useAppStore } from '@/store/useAppStore';
import type { Task } from '@/types';

function seedTask(overrides: Partial<Task>): void {
  useAppStore.getState().setTasks([
    {
      id:     'task-1',
      title:  'Test task',
      status: 'open',
      ...overrides,
    },
  ]);
}

afterEach(() => {
  useAppStore.getState().resetAppState();
});

// role: null has no permissions at all, so this exercises the permission
// gate without reaching Supabase/mock-store I/O.
test('missing tasks.complete permission returns not_authorized without touching the repository', async () => {
  const result = await completeTask({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        null,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

// child has tasks.complete, so this exercises the privileged-role guard.
// EX-05 direct completion is owner/admin/adult only; child completion
// requests are a separate EX-06 flow.
test('child role has tasks.complete but is not authorized for direct completion', async () => {
  const result = await completeTask({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        'child',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

// EX-10 (mock-mode model of the RPC's points_balances upsert): direct
// completion credits the caller (completed_by_profile_id = v_caller in
// the real RPC), with the task's own points value — no formula, no
// multiplier, exactly the stored amount. No existing balance row for
// this profile — the upsert path must create one, not throw.
test('direct completion awards the task\'s points to the current user, creating a balance row', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  seedTask({ points: 15, householdId: 'house-1' });

  const result = await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  assert.deepEqual(result, { ok: true });
  assert.equal(useAppStore.getState().tasks.find((t) => t.id === 'task-1')?.status, 'completed');
  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === 'parent-1');
  assert.equal(balance?.balance, 15);
});

// Upsert increment path: an existing balance row must be added to, not
// replaced or overwritten.
test('direct completion increments an existing balance rather than replacing it', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  useAppStore.getState().setPointsBalances([{ userId: 'parent-1', householdId: 'house-1', balance: 40 }]);
  seedTask({ points: 15, householdId: 'house-1' });

  await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === 'parent-1');
  assert.equal(balance?.balance, 55);
});

// Exactly-once: a task that is not 'open' (already completed) is rejected
// by the same not_open guard before any points logic runs — a second
// completion attempt must not award a second time.
test('completing an already-completed task is rejected and does not award points again', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  seedTask({ points: 15, householdId: 'house-1', status: 'completed' });

  const result = await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  assert.deepEqual(result, { ok: false, reason: 'not_open' });
  assert.equal(useAppStore.getState().pointsBalances.length, 0);
});

// A task with points = 0 still completes normally — no invented threshold
// behavior; the awarded amount is exactly the (zero) stored value.
test('completing a zero-point task succeeds without throwing', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  seedTask({ points: 0, householdId: 'house-1' });

  const result = await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  assert.deepEqual(result, { ok: true });
});
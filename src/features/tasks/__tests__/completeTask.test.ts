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

// EX-10 (mock-mode model of the RPC's points_balances upsert): an adult
// completing their own task is credited the task's own points value — no
// formula, no multiplier, exactly the stored amount. No existing balance
// row for this profile — the upsert path must create one, not throw.
test('direct completion of the adult\'s own task awards its points to them, creating a balance row', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  seedTask({ points: 15, householdId: 'house-1', assigneeId: 'parent-1' });

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
  seedTask({ points: 15, householdId: 'house-1', assigneeId: 'parent-1' });

  await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === 'parent-1');
  assert.equal(balance?.balance, 55);
});

// Exactly-once: a task that is not 'open' (already completed) is rejected
// by the same not_open guard before any points logic runs — a second
// completion attempt must not award a second time.
test('completing an already-completed task is rejected and does not award points again', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  seedTask({ points: 15, householdId: 'house-1', status: 'completed', assigneeId: 'child-1' });

  const result = await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  assert.deepEqual(result, { ok: false, reason: 'not_open' });
  assert.equal(useAppStore.getState().pointsBalances.length, 0);
});

// A task with points = 0 still completes normally — no invented threshold
// behavior; the awarded amount is exactly the (zero) stored value.
test('completing a zero-point task succeeds without throwing', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  seedTask({ points: 0, householdId: 'house-1', assigneeId: 'parent-1' });

  const result = await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  assert.deepEqual(result, { ok: true });
});

// ── Slice 6B.2: Points belong to the effective assignee ────────────────────

// Case A (primary regression): an adult pressing Complete on a child's
// task credits the CHILD; the acting adult gets nothing.
test('6B.2: adult completing a child\'s task credits the child, not the adult', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  useAppStore.getState().setPointsBalances([
    { userId: 'parent-1', householdId: 'house-1', balance: 0 },
    { userId: 'child-1',  householdId: 'house-1', balance: 15 },
  ]);
  seedTask({ points: 25, householdId: 'house-1', assigneeId: 'child-1' });

  const result = await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  assert.deepEqual(result, { ok: true });
  assert.equal(useAppStore.getState().tasks[0]?.status, 'completed');
  const byId = (id: string) => useAppStore.getState().pointsBalances.find((pb) => pb.userId === id)?.balance;
  assert.equal(byId('child-1'), 40);
  assert.equal(byId('parent-1'), 0);
});

// Case D/E: a claimed open-to-anyone task stores the claimant as its
// assignee, so the claimant is credited whoever presses Complete.
test('6B.2: a claimed task credits its claimant even when another adult completes it', async () => {
  useAppStore.getState().setUser({ id: 'parent-2', name: 'Other parent' });
  seedTask({ points: 6, householdId: 'house-1', assigneeId: 'child-2' });

  await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'owner' });

  const pbs = useAppStore.getState().pointsBalances;
  assert.deepEqual(pbs, [{ userId: 'child-2', householdId: 'house-1', balance: 6 }]);
});

// Unclaimed open-to-anyone: no recipient yet — refused, nothing credited.
test('6B.2: an unclaimed open-to-anyone task cannot be completed and credits nobody', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  seedTask({ points: 5, householdId: 'house-1' });

  const result = await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  assert.deepEqual(result, { ok: false, reason: 'failed' });
  assert.equal(useAppStore.getState().tasks[0]?.status, 'open');
  assert.equal(useAppStore.getState().pointsBalances.length, 0);
});

// Zero-point child task: completes, and no balance moves.
test('6B.2: zero-point child task completes without changing any balance', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  useAppStore.getState().setPointsBalances([
    { userId: 'parent-1', householdId: 'house-1', balance: 3 },
    { userId: 'child-1',  householdId: 'house-1', balance: 15 },
  ]);
  seedTask({ points: 0, householdId: 'house-1', assigneeId: 'child-1' });

  const result = await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  assert.deepEqual(result, { ok: true });
  const byId = (id: string) => useAppStore.getState().pointsBalances.find((pb) => pb.userId === id)?.balance;
  assert.equal(byId('child-1'), 15);
  assert.equal(byId('parent-1'), 3);
});

// A second Complete on the same task is refused and credits nothing more.
test('6B.2: repeated Complete credits the assignee exactly once', async () => {
  useAppStore.getState().setUser({ id: 'parent-1', name: 'Parent' });
  seedTask({ points: 5, householdId: 'house-1', assigneeId: 'child-1' });

  const first  = await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });
  const second = await completeTask({ taskId: 'task-1', householdId: 'house-1', role: 'adult' });

  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: false, reason: 'not_open' });
  assert.deepEqual(useAppStore.getState().pointsBalances, [{ userId: 'child-1', householdId: 'house-1', balance: 5 }]);
});

// The repository sends only the task id — never a recipient. The server
// derives the recipient from the task row.
test('6B.2: the complete_task call carries no recipient argument', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../../lib/repositories/tasks.ts', import.meta.url), 'utf8');
  const call = /rpc\('complete_task',\s*(\{[^}]*\})\)/.exec(src);
  assert.ok(call, 'complete_task rpc call not found');
  assert.equal(call[1].replace(/\s+/g, ''), '{p_task_id:taskId}');
});
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { requestTaskCompletion } from '@/features/tasks/requestTaskCompletion';
import { useAppStore } from '@/store/useAppStore';
import type { Task } from '@/types';

// Mock-mode coverage (isSupabaseConfigured is false in this test
// environment — no EXPO_PUBLIC_SUPABASE_* env vars are set). No existing
// sibling test file (completeTask.test.ts, claimOpenTask.test.ts)
// exercises the mock-mode branch; this is new coverage for this
// function specifically, following the store-seeding shape the mock
// branches themselves already use (useAppStore.getState()/setTasks).
function seedTask(overrides: Partial<Task>): void {
  useAppStore.getState().setTasks([
    {
      id:         'task-1',
      title:      'Test task',
      status:     'open',
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
test('missing tasks.complete permission returns not_authorized without touching the repository', async () => {
  const result = await requestTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    profileId:   'profile-1',
    role:        null,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

// adult has tasks.complete (it's shared with child), so this exercises
// the privileged-role guard specifically — EX-06 completion requests are
// child-only; privileged roles should route through completeTask instead.
test('adult role has tasks.complete but is not authorized to submit a completion request', async () => {
  const result = await requestTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    profileId:   'profile-1',
    role:        'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

// The assigned child, submitting on their own open task — the approved
// happy path (mock-mode: isSupabaseConfigured is false in this
// environment, so this exercises the local-store branch directly).
test('assigned child can submit a completion request for their own open task', async () => {
  seedTask({ status: 'open', assigneeId: 'child-1' });

  const result = await requestTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    profileId:   'child-1',
    role:        'child',
  });

  assert.deepEqual(result, { ok: true });
  const task = useAppStore.getState().tasks.find((t) => t.id === 'task-1');
  assert.equal(task?.status, 'needs_attention');
});

// Approved product decision (Option A — assigned child only): a
// different child in the same household is not authorized to submit a
// completion request for a task assigned to someone else, even though
// tasks.complete is granted to them too.
test('a different child cannot submit a completion request for a sibling\'s task', async () => {
  seedTask({ status: 'open', assigneeId: 'child-1' });

  const result = await requestTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    profileId:   'child-2',
    role:        'child',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
  const task = useAppStore.getState().tasks.find((t) => t.id === 'task-1');
  assert.equal(task?.status, 'open');
});

// A task that has already moved past 'open' (already submitted, or
// already completed by some other path) follows the same 'not_open'
// handling completeTask.ts already establishes for its own equivalent
// case — no duplicate submission, no silent success.
test('a task that is already needs_attention cannot be submitted again', async () => {
  seedTask({ status: 'needs_attention', assigneeId: 'child-1' });

  const result = await requestTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    profileId:   'child-1',
    role:        'child',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_open' });
});

test('a completed task cannot be submitted for review', async () => {
  seedTask({ status: 'completed', assigneeId: 'child-1' });

  const result = await requestTaskCompletion({
    taskId:      'task-1',
    householdId: 'house-1',
    profileId:   'child-1',
    role:        'child',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_open' });
});

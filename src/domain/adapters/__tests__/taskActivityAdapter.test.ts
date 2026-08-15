import assert from 'node:assert/strict';
import test from 'node:test';
import { TaskAdapter } from '@/domain/adapters/taskActivityAdapter';
import type { Task } from '@/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id:     't1',
    title:  'Clean the kitchen',
    status: 'open',
    ...overrides,
  };
}

test('maps a plain open task (no assignee) to a task-kind activity with a claim action', () => {
  const activity = TaskAdapter.toFamilyActivity(makeTask());
  assert.equal(activity.kind, 'task');
  assert.equal(activity.status, 'open');
  assert.equal(activity.requiresApproval, false);
  assert.deepEqual(activity.availableActions, ['claim']);
});

test('an assigned, non-completed task exposes a complete action instead of claim', () => {
  const activity = TaskAdapter.toFamilyActivity(makeTask({ assigneeId: 'child-1' }));
  assert.deepEqual(activity.availableActions, ['complete']);
});

test('carries over assignee/creator/points/dueAt', () => {
  const activity = TaskAdapter.toFamilyActivity(makeTask({
    assigneeId:  'child-1',
    createdById: 'parent-1',
    points:      10,
    dueAt:       '2026-07-09T10:00:00.000Z',
  }));
  assert.equal(activity.targetProfileId, 'child-1');
  assert.equal(activity.createdByProfileId, 'parent-1');
  assert.equal(activity.points, 10);
  assert.equal(activity.dueAt, '2026-07-09T10:00:00.000Z');
});

// P2-D03: dueAtHasTime is carried through unchanged, never derived from
// dueAt's shape here — the adapter is a pure passthrough for this field.
test('carries over description and dueAtHasTime', () => {
  const activity = TaskAdapter.toFamilyActivity(makeTask({
    description:  'Load and run the dishwasher',
    dueAt:        '2026-08-15T00:00:00.000Z',
    dueAtHasTime: true,
  }));
  assert.equal(activity.description, 'Load and run the dishwasher');
  assert.equal(activity.dueAtHasTime, true);
});

test('a needs_attention task exposes approve and decline actions', () => {
  const activity = TaskAdapter.toFamilyActivity(makeTask({ status: 'needs_attention', assigneeId: 'child-1' }));
  assert.deepEqual(activity.availableActions, ['approve', 'decline']);
});

test('completed tasks expose no actions, whether or not still assigned', () => {
  assert.deepEqual(TaskAdapter.toFamilyActivity(makeTask({ status: 'completed' })).availableActions, []);
  assert.deepEqual(
    TaskAdapter.toFamilyActivity(makeTask({ status: 'completed', assigneeId: 'child-1' })).availableActions,
    [],
  );
});

test('maps every TaskStatus to a FamilyActivity status 1:1', () => {
  const statuses: Task['status'][] = ['open', 'pending', 'accepted', 'in_progress', 'needs_attention', 'completed'];
  for (const status of statuses) {
    const activity = TaskAdapter.toFamilyActivity(makeTask({ status }));
    assert.equal(activity.status, status);
  }
});

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

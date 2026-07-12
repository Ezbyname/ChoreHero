import assert from 'node:assert/strict';
import test from 'node:test';
import { getTasksCreatedByUser } from '@/features/tasks/taskFilters';
import type { Task } from '@/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id:     't1',
    title:  'Take out trash',
    status: 'open',
    ...overrides,
  };
}

test('getTasksCreatedByUser returns only tasks authored by the given profile', () => {
  const tasks = [
    makeTask({ id: 't1', createdById: 'parent-1' }),
    makeTask({ id: 't2', createdById: 'parent-2' }),
    makeTask({ id: 't3', createdById: 'parent-1', assigneeId: 'child-1' }),
  ];

  const result = getTasksCreatedByUser(tasks, 'parent-1');
  assert.deepEqual(result.map((t) => t.id), ['t1', 't3']);
});

test('getTasksCreatedByUser is independent of assignment — includes both open and assigned tasks', () => {
  const tasks = [
    makeTask({ id: 't1', createdById: 'parent-1', assigneeId: undefined }),
    makeTask({ id: 't2', createdById: 'parent-1', assigneeId: 'child-1', status: 'completed' }),
  ];

  const result = getTasksCreatedByUser(tasks, 'parent-1');
  assert.deepEqual(result.map((t) => t.id), ['t1', 't2']);
});

test('getTasksCreatedByUser returns an empty array when the profile created nothing', () => {
  const tasks = [makeTask({ id: 't1', createdById: 'parent-2' })];
  assert.deepEqual(getTasksCreatedByUser(tasks, 'parent-1'), []);
});

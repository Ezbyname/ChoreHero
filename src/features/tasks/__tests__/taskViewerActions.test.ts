import assert from 'node:assert/strict';
import test from 'node:test';

import { TaskAdapter } from '@/domain/adapters';
import { applyViewerTaskActions } from '@/features/tasks/taskViewerActions';
import type { Task } from '@/types';

const waiting: Task = { id: 't1', title: 'x', status: 'needs_attention', assigneeId: 'child-1', householdId: 'h' };
const open: Task    = { id: 't2', title: 'y', status: 'open', assigneeId: 'child-1', householdId: 'h' };
const act = (t: Task) => TaskAdapter.toFamilyActivity(t);

test('submitting child on their own waiting task -> only "manage_completion"', () => {
  const a = applyViewerTaskActions(act(waiting), { canApproveTaskCompletion: false, viewerId: 'child-1', role: 'child' });
  assert.deepEqual(a.availableActions, ['manage_completion']);
});

test('a sibling child sees no actions on someone else\'s waiting task', () => {
  const a = applyViewerTaskActions(act(waiting), { canApproveTaskCompletion: false, viewerId: 'child-2', role: 'child' });
  assert.deepEqual(a.availableActions, []);
});

test('reviewer keeps approve/decline and never gets manage_completion', () => {
  const a = applyViewerTaskActions(act(waiting), { canApproveTaskCompletion: true, viewerId: 'owner', role: 'owner' });
  assert.deepEqual(a.availableActions, ['approve', 'decline']);
});

test('open task for the child is unchanged (complete)', () => {
  const a = applyViewerTaskActions(act(open), { canApproveTaskCompletion: false, viewerId: 'child-1', role: 'child' });
  assert.deepEqual(a.availableActions, ['complete']);
});

test('signed-out / unknown viewer never gets manage_completion', () => {
  const a = applyViewerTaskActions(act(waiting), { canApproveTaskCompletion: false, viewerId: null, role: 'child' });
  assert.deepEqual(a.availableActions, []);
});

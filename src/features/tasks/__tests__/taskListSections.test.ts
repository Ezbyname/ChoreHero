import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildTodaySections,
  deriveTaskStatus,
  latestSubmissionByTask,
  pendingPhotoCountByTask,
} from '@/features/tasks/taskListSections';
import type { Task, TaskSubmissionSummary } from '@/types';

const NOW = new Date(2026, 9, 30, 12, 0, 0);
const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: id, status: 'open', assigneeId: 'child-1', householdId: 'hh', ...over });
const sub = (id: string, taskId: string, status: TaskSubmissionSummary['status'], photoCount = 0, submittedAt = '2026-10-30T10:00:00Z'): TaskSubmissionSummary =>
  ({ id, taskId, status, submittedByProfileId: 'child-1', submittedAt, photoCount });

// ── Duplicate reviewer card (QA: "QA-REV-01 No Photo Approval" twice) ────────

test('a pending task appears ONCE for a reviewer: in "Waiting for your review", never again in the general list', () => {
  const tasks = [
    task('qa-rev-01', { title: 'QA-REV-01 No Photo Approval', status: 'needs_attention' }),
    task('free', { assigneeId: undefined }),
  ];
  const s = buildTodaySections(tasks, { canReview: true }, NOW);
  assert.deepEqual(s.reviewTasks.map((t) => t.id), ['qa-rev-01']);
  assert.deepEqual(s.generalTasks.map((t) => t.id), ['free']);
  const all = [...s.reviewTasks, ...s.generalTasks].map((t) => t.id);
  assert.equal(new Set(all).size, all.length);
});

test('identity is the task id, not the title: two different tasks with the same title both show', () => {
  const tasks = [task('a', { title: 'Same', status: 'needs_attention' }), task('b', { title: 'Same', status: 'needs_attention' })];
  assert.deepEqual(buildTodaySections(tasks, { canReview: true }, NOW).reviewTasks.map((t) => t.id), ['a', 'b']);
});

test('the same id listed twice by a buggy source is still rendered once', () => {
  const t = task('dup', { assigneeId: undefined });
  assert.deepEqual(buildTodaySections([t, t], { canReview: false }, NOW).generalTasks.map((x) => x.id), ['dup']);
});

test('a child (cannot review) still sees their own waiting task in the general list, and no review section', () => {
  const s = buildTodaySections([task('mine', { status: 'needs_attention' })], { canReview: false }, NOW);
  assert.deepEqual(s.reviewTasks, []);
  assert.deepEqual(s.generalTasks.map((t) => t.id), ['mine']);
});

test('due-today assigned tasks are included; completed and other days are not', () => {
  const s = buildTodaySections([
    task('today', { dueAt: new Date(2026, 9, 30, 18).toISOString() }),
    task('tomorrow', { dueAt: new Date(2026, 9, 31, 9).toISOString() }),
    task('done', { status: 'completed', dueAt: new Date(2026, 9, 30, 9).toISOString() }),
  ], { canReview: true }, NOW);
  assert.deepEqual(s.generalTasks.map((t) => t.id), ['today']);
});

test('TodayScreen renders review cards from buildTodaySections and keys cards by activity id', () => {
  const today = readFileSync(new URL('../../../screens/TodayScreen.tsx', import.meta.url), 'utf8');
  assert.ok(today.includes('buildTodaySections('));
  assert.ok(!/getTodayTasks\(/.test(today));
  const list = readFileSync(new URL('../../../components/ActivityList.tsx', import.meta.url), 'utf8');
  assert.ok(list.includes('key={activity.id}'));
});

// ── Reviewer photo count (metadata only) ────────────────────────────────────

test('photo count per pending submission: 0, 1 and several; non-pending submissions ignored', () => {
  const counts = pendingPhotoCountByTask([
    sub('s1', 't-none', 'pending', 0),
    sub('s2', 't-one', 'pending', 1),
    sub('s3', 't-many', 'pending', 5),
    sub('s4', 't-old', 'rejected', 3),
    sub('s5', 't-wd', 'withdrawn', 2),
  ]);
  assert.equal(counts.get('t-none'), 0);
  assert.equal(counts.get('t-one'), 1);
  assert.equal(counts.get('t-many'), 5);
  assert.equal(counts.has('t-old'), false);
  assert.equal(counts.has('t-wd'), false);
});

test('reviewer cards get their count from store metadata, never by loading evidence', () => {
  const today = readFileSync(new URL('../../../screens/TodayScreen.tsx', import.meta.url), 'utf8');
  assert.ok(today.includes('pendingPhotoCountByTask(taskSubmissions)'));
  assert.ok(!/fetchTaskCompletionEvidence|evidenceSessionCache/.test(today));
});

// ── Assigned statuses ───────────────────────────────────────────────────────

test('Assigned status comes from the real task status, refined by the latest submission for open tasks', () => {
  assert.deepEqual(deriveTaskStatus({ status: 'open', assigneeId: 'c' }, undefined), { key: 'open', tone: 'neutral' });
  assert.deepEqual(deriveTaskStatus({ status: 'open', assigneeId: undefined }, undefined), { key: 'open_to_anyone', tone: 'neutral' });
  assert.deepEqual(deriveTaskStatus({ status: 'needs_attention', assigneeId: 'c' }, { status: 'pending' }), { key: 'waiting_for_review', tone: 'warning' });
  assert.deepEqual(deriveTaskStatus({ status: 'completed', assigneeId: 'c' }, { status: 'approved' }), { key: 'completed', tone: 'success' });
  assert.deepEqual(deriveTaskStatus({ status: 'open', assigneeId: 'c' }, { status: 'rejected' }), { key: 'needs_retry', tone: 'danger' });
  assert.deepEqual(deriveTaskStatus({ status: 'open', assigneeId: 'c' }, { status: 'withdrawn' }), { key: 'taken_back', tone: 'neutral' });
  assert.deepEqual(deriveTaskStatus({ status: 'in_progress', assigneeId: 'c' }, undefined), { key: 'in_progress', tone: 'info' });
  // tasks.status is the authority: a stale "rejected" never overrides a completed task.
  assert.equal(deriveTaskStatus({ status: 'completed', assigneeId: 'c' }, { status: 'rejected' }).key, 'completed');
});

test('latest submission per task wins regardless of input order', () => {
  const latest = latestSubmissionByTask([
    sub('old', 't', 'rejected', 0, '2026-10-29T10:00:00Z'),
    sub('new', 't', 'pending', 2, '2026-10-30T10:00:00Z'),
    sub('older', 't', 'withdrawn', 0, '2026-10-28T10:00:00Z'),
  ]);
  assert.equal(latest.get('t')?.id, 'new');
});

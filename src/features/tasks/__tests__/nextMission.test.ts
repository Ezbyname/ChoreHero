import assert from 'node:assert/strict';
import test from 'node:test';

import { selectNextMission, type NextMissionResult } from '@/features/tasks/nextMission';
import type { Task, TaskSubmissionSummary } from '@/types';

const IL = 'Asia/Jerusalem';
const LA = 'America/Los_Angeles';
const KID = 'kid-1';
const NOW = new Date('2026-11-13T12:00:00Z'); // IL 14:00, 13 Nov

const TODAY = '2026-11-13T00:00:00.000Z';
const YESTERDAY = '2026-11-12T00:00:00.000Z';
const TOMORROW = '2026-11-14T00:00:00.000Z';

function t(id: string, over: Partial<Task> = {}): Task {
  return { id, title: id, status: 'open', assigneeId: KID, ...over };
}

function run(tasks: Task[], rejected: string[] = [], timeZone = IL, now = NOW): NextMissionResult {
  const latest = new Map<string, Pick<TaskSubmissionSummary, 'status'>>(
    rejected.map((id) => [id, { status: 'rejected' }]),
  );
  return selectNextMission({ tasks, latestSubmission: latest, childId: KID, now, timeZone });
}

function pick(result: NextMissionResult): string {
  assert.equal(result.kind, 'mission');
  return result.kind === 'mission' ? `${result.reason}:${result.task.id}` : '';
}

const ALL_TIERS = [
  t('sentback', { dueAt: TODAY }),
  t('overdue', { dueAt: YESTERDAY }),
  t('timed', { dueAt: '2026-11-13T15:00:00Z', dueAtHasTime: true }),
  t('dateonly', { dueAt: TODAY }),
  t('undated', { createdAt: '2026-11-01T00:00:00Z' }),
  t('anyone', { assigneeId: undefined }),
];

test('priority: sent back > overdue > timed today > date-only today > undated > open-to-anyone', () => {
  const rejected = ['sentback'];
  const order: string[] = [];
  let remaining = [...ALL_TIERS];
  while (remaining.length > 0) {
    const r = run(remaining, rejected);
    const id = r.kind === 'mission' ? r.task.id : 'NONE';
    order.push(pick(r));
    remaining = remaining.filter((x) => x.id !== id);
  }
  assert.deepEqual(order, [
    'sent_back:sentback',
    'overdue:overdue',
    'due_today_timed:timed',
    'due_today:dateonly',
    'undated:undated',
    'open_to_anyone:anyone',
  ]);
});

test('a rejected submission on a needs_attention task is not "sent back" (it is pending again)', () => {
  const r = run([t('a', { status: 'needs_attention' }), t('b')], ['a']);
  assert.equal(pick(r), 'undated:b');
});

test('future-due tasks are excluded from the Hero — never promoted to fill space', () => {
  assert.deepEqual(run([t('f1', { dueAt: TOMORROW }), t('f2', { dueAt: '2026-11-20T09:00:00Z', dueAtHasTime: true })]), { kind: 'none' });
  // Also excluded when sent back or open-to-anyone.
  assert.deepEqual(run([t('f3', { dueAt: TOMORROW }), t('f4', { dueAt: TOMORROW, assigneeId: undefined })], ['f3']), { kind: 'none' });
});

test('future-due tasks do not outrank undated work', () => {
  assert.equal(pick(run([t('future', { dueAt: TOMORROW }), t('undated')])), 'undated:undated');
});

test('overdue: earliest due first (oldest obligation), then id', () => {
  const r = run([
    t('o-b', { dueAt: '2026-11-10T00:00:00.000Z' }),
    t('o-c', { dueAt: '2026-11-12T08:00:00Z', dueAtHasTime: true }),
    t('o-a', { dueAt: '2026-11-10T00:00:00.000Z' }),
    t('o-d', { dueAt: '2026-11-11T00:00:00.000Z' }),
  ]);
  assert.equal(pick(r), 'overdue:o-a'); // 10 Nov tie → id
  const r2 = run([t('o-c', { dueAt: '2026-11-12T08:00:00Z', dueAtHasTime: true }), t('o-d', { dueAt: '2026-11-11T00:00:00.000Z' })]);
  assert.equal(pick(r2), 'overdue:o-d');
});

test('timed due today: earliest time first', () => {
  const r = run([
    t('late', { dueAt: '2026-11-13T18:00:00Z', dueAtHasTime: true }),
    t('early', { dueAt: '2026-11-13T07:00:00Z', dueAtHasTime: true }),
  ]);
  assert.equal(pick(r), 'due_today_timed:early');
});

test('deterministic id tie-break regardless of input order', () => {
  const a = [t('b', { dueAt: TODAY }), t('a', { dueAt: TODAY }), t('c', { dueAt: TODAY })];
  assert.equal(pick(run(a)), 'due_today:a');
  assert.equal(pick(run([...a].reverse())), 'due_today:a');
  const sb = [t('z'), t('y')];
  assert.equal(pick(run(sb, ['z', 'y'])), 'sent_back:y');
});

test('undated: oldest createdAt first', () => {
  const r = run([
    t('newer', { createdAt: '2026-11-10T00:00:00Z' }),
    t('older', { createdAt: '2026-11-01T00:00:00Z' }),
  ]);
  assert.equal(pick(r), 'undated:older');
});

test('only pending-review tasks → waiting_for_review (not actionable)', () => {
  const r = run([t('p1', { status: 'needs_attention' }), t('p2', { status: 'needs_attention', dueAt: TODAY }), t('done', { status: 'completed' })]);
  assert.deepEqual(r, { kind: 'waiting_for_review', pendingCount: 2 });
});

test('no available task → none; completed and sibling tasks are ignored', () => {
  assert.deepEqual(run([]), { kind: 'none' });
  assert.deepEqual(run([t('done', { status: 'completed' }), t('sib', { assigneeId: 'kid-2' })]), { kind: 'none' });
});

test('timezone: a timed task is today in LA but overdue in Israel', () => {
  const task = t('x', { dueAt: '2026-11-13T07:00:00Z', dueAtHasTime: true }); // IL 09:00 13 Nov; LA 23:00 12 Nov
  const laMorning = new Date('2026-11-13T16:00:00Z'); // LA 08:00 13 Nov, IL 18:00 13 Nov
  assert.equal(pick(run([task], [], LA, laMorning)), 'overdue:x');
  assert.equal(pick(run([task], [], IL, laMorning)), 'due_today_timed:x');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { selectDailyProgress, selectFamilyToday } from '@/features/tasks/dailyProgress';
import { mapTaskRow } from '@/store/useAppStore';
import type { Task } from '@/types';

const IL = 'Asia/Jerusalem';      // UTC+2 in November 2026
const LA = 'America/Los_Angeles'; // UTC-8 in November 2026
const KID = 'kid-1';
const SIB = 'kid-2';

// Israel 14:00 on 13 Nov 2026.
const NOW = new Date('2026-11-13T12:00:00Z');
const TODAY_DATE_ONLY = '2026-11-13T00:00:00.000Z';

let seq = 0;
function task(over: Partial<Task>): Task {
  seq += 1;
  return { id: `t${seq}`, title: `Task ${seq}`, status: 'open', assigneeId: KID, ...over };
}

test('D1: due today open / pending / completed — pending stays in denominator but is not done', () => {
  const tasks = [
    task({ dueAt: TODAY_DATE_ONLY, status: 'open' }),
    task({ dueAt: TODAY_DATE_ONLY, status: 'needs_attention' }),
    task({ dueAt: TODAY_DATE_ONLY, status: 'completed' }),
  ];
  assert.deepEqual(selectDailyProgress(tasks, KID, NOW, IL), { completed: 1, total: 3 });
});

test('D1: due today but completed on an earlier day still counts as completed', () => {
  const tasks = [task({ dueAt: TODAY_DATE_ONLY, status: 'completed', completedAt: '2026-11-11T09:00:00Z' })];
  assert.deepEqual(selectDailyProgress(tasks, KID, NOW, IL), { completed: 1, total: 1 });
});

test('D1: completed today but due another day is NOT counted (completed-out-of-due-today, not completed-today)', () => {
  const tasks = [task({ dueAt: '2026-11-10T00:00:00.000Z', status: 'completed', completedAt: '2026-11-13T09:00:00Z' })];
  assert.deepEqual(selectDailyProgress(tasks, KID, NOW, IL), { completed: 0, total: 0 });
});

test('D1: overdue, undated and future tasks are excluded', () => {
  const tasks = [
    task({ dueAt: '2026-11-12T00:00:00.000Z' }),
    task({}),
    task({ dueAt: '2026-11-14T00:00:00.000Z' }),
    task({ dueAt: TODAY_DATE_ONLY }),
  ];
  assert.deepEqual(selectDailyProgress(tasks, KID, NOW, IL), { completed: 0, total: 1 });
});

test('D1: unclaimed open-to-anyone excluded; claimed task due today included; sibling excluded', () => {
  const tasks = [
    task({ assigneeId: undefined, dueAt: TODAY_DATE_ONLY }),
    task({ assigneeId: KID, dueAt: TODAY_DATE_ONLY }), // claimed by this child
    task({ assigneeId: SIB, dueAt: TODAY_DATE_ONLY }),
  ];
  assert.deepEqual(selectDailyProgress(tasks, KID, NOW, IL), { completed: 0, total: 1 });
});

test('D1 Israel: date-only boundary — just after local midnight the new date is today', () => {
  const justAfterMidnight = new Date('2026-11-12T22:30:00Z'); // IL 00:30 on 13 Nov
  const tasks = [
    task({ dueAt: '2026-11-13T00:00:00.000Z', dueAtHasTime: false }),
    task({ dueAt: '2026-11-12T00:00:00.000Z', dueAtHasTime: false }),
  ];
  assert.deepEqual(selectDailyProgress(tasks, KID, justAfterMidnight, IL), { completed: 0, total: 1 });
});

test('D1 Israel: timed boundary — 22:30Z is the next local day', () => {
  const tasks = [
    task({ dueAt: '2026-11-12T22:30:00Z', dueAtHasTime: true }), // IL 13 Nov 00:30 → today
    task({ dueAt: '2026-11-13T22:30:00Z', dueAtHasTime: true }), // IL 14 Nov 00:30 → tomorrow
  ];
  assert.deepEqual(selectDailyProgress(tasks, KID, NOW, IL), { completed: 0, total: 1 });
  assert.equal(selectDailyProgress(tasks.slice(0, 1), KID, NOW, IL).total, 1);
});

test('D1 Los Angeles (UTC-negative): date-only is not pulled into the previous day', () => {
  const lateEvening = new Date('2026-11-13T07:30:00Z'); // LA 23:30 on 12 Nov
  const tasks = [task({ dueAt: '2026-11-13T00:00:00.000Z', dueAtHasTime: false })];
  // Naive local reading of UTC midnight would put this on 12 Nov in LA.
  assert.equal(selectDailyProgress(tasks, KID, lateEvening, LA).total, 0);
  const afterMidnight = new Date('2026-11-13T08:30:00Z'); // LA 00:30 on 13 Nov
  assert.equal(selectDailyProgress(tasks, KID, afterMidnight, LA).total, 1);
});

test('D1 Los Angeles: timed due uses the LA local day', () => {
  const laNoon = new Date('2026-11-13T20:00:00Z'); // LA 12:00 on 13 Nov
  const tasks = [
    task({ dueAt: '2026-11-14T06:00:00Z', dueAtHasTime: true, status: 'completed' }), // LA 13 Nov 22:00
    task({ dueAt: '2026-11-13T07:00:00Z', dueAtHasTime: true }),                      // LA 12 Nov 23:00
  ];
  assert.deepEqual(selectDailyProgress(tasks, KID, laNoon, LA), { completed: 1, total: 1 });
});

test('D2 Family Today: correct total and completed count across assigned members', () => {
  const tasks = [
    task({ assigneeId: KID, dueAt: TODAY_DATE_ONLY, status: 'completed' }),
    task({ assigneeId: SIB, dueAt: TODAY_DATE_ONLY, status: 'completed' }),
    task({ assigneeId: SIB, dueAt: TODAY_DATE_ONLY, status: 'needs_attention' }),
    task({ assigneeId: SIB, dueAt: '2026-11-12T00:00:00.000Z' }),    // overdue
    task({ assigneeId: undefined, dueAt: TODAY_DATE_ONLY }),         // unclaimed
  ];
  assert.deepEqual(selectFamilyToday(tasks, NOW, IL), { completed: 2, total: 3 });
});

test('D2 Family Today: counts-only result, never sibling titles or points', () => {
  const tasks = [task({ assigneeId: SIB, dueAt: TODAY_DATE_ONLY, title: 'SECRET-SIBLING-TITLE', points: 77 })];
  const result = selectFamilyToday(tasks, NOW, IL);
  assert.deepEqual(Object.keys(result).sort(), ['completed', 'total']);
  const json = JSON.stringify(result);
  assert.ok(!json.includes('SECRET-SIBLING-TITLE'));
  assert.ok(!json.includes('77'));
});

test('mapTaskRow maps completed_at → completedAt (null → undefined)', () => {
  const base = {
    id: 'x', household_id: 'hh', title: 'T', description: null, status: 'completed' as const,
    created_by_profile_id: 'a', assigned_by_profile_id: null, assignee_profile_id: KID,
    due_at: null, due_at_has_time: null, points: 1, source_service_request_id: null,
    completed_at: '2026-11-13T09:00:00Z', completed_by_profile_id: KID,
    created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-13T09:00:00Z',
  };
  assert.equal(mapTaskRow(base).completedAt, '2026-11-13T09:00:00Z');
  assert.equal(mapTaskRow({ ...base, completed_at: null }).completedAt, undefined);
});

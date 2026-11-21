import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyDue, dueDayKey, localDayKey } from '@/domain/localDay';

const IL = 'Asia/Jerusalem';      // UTC+2 in November 2026
const LA = 'America/Los_Angeles'; // UTC-8 in November 2026

test('localDayKey uses the given zone, not the machine zone', () => {
  const instant = new Date('2026-11-12T23:30:00Z');
  assert.equal(localDayKey(instant, IL), '2026-11-13');
  assert.equal(localDayKey(instant, LA), '2026-11-12');
  assert.equal(localDayKey(instant, 'UTC'), '2026-11-12');
});

test('date-only due keeps its intended calendar date in every zone', () => {
  const task = { dueAt: '2026-11-13T00:00:00.000Z', dueAtHasTime: false };
  assert.equal(dueDayKey(task, IL), '2026-11-13');
  assert.equal(dueDayKey(task, LA), '2026-11-13');
  // Legacy row with no discriminator is treated as date-only.
  assert.equal(dueDayKey({ dueAt: task.dueAt }, LA), '2026-11-13');
});

test('timed due uses the viewer local day', () => {
  const task = { dueAt: '2026-11-13T22:30:00Z', dueAtHasTime: true };
  assert.equal(dueDayKey(task, IL), '2026-11-14');
  assert.equal(dueDayKey(task, LA), '2026-11-13');
});

test('undated / unparseable due → none', () => {
  const now = new Date('2026-11-13T10:00:00Z');
  assert.equal(classifyDue({}, now, IL), 'none');
  assert.equal(classifyDue({ dueAt: 'not-a-date', dueAtHasTime: true }, now, IL), 'none');
});

test('classifyDue: timed earlier today is today, previous day is overdue, next day is future', () => {
  const now = new Date('2026-11-13T12:00:00Z'); // Israel 14:00
  assert.equal(classifyDue({ dueAt: '2026-11-13T06:00:00Z', dueAtHasTime: true }, now, IL), 'today');
  // 22:30Z on the 12th is 00:30 on the 13th in Israel → today.
  assert.equal(classifyDue({ dueAt: '2026-11-12T22:30:00Z', dueAtHasTime: true }, now, IL), 'today');
  // 21:00Z on the 12th is 23:00 on the 12th in Israel → overdue.
  assert.equal(classifyDue({ dueAt: '2026-11-12T21:00:00Z', dueAtHasTime: true }, now, IL), 'overdue');
  assert.equal(classifyDue({ dueAt: '2026-11-12T00:00:00.000Z', dueAtHasTime: false }, now, IL), 'overdue');
  assert.equal(classifyDue({ dueAt: '2026-11-14T00:00:00.000Z', dueAtHasTime: false }, now, IL), 'future');
});

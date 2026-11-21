// Viewer-local calendar-day semantics for derived Home selectors. Pure — no
// React, no expo-*, no react-native imports; node-test safe.
//
// Mirrors the due_at convention owned by src/domain/dateFormat.ts:
//   - DATE_ONLY (dueAtHasTime false/undefined): written as UTC midnight of
//     the intended calendar date, so the calendar date is read back from
//     UTC components — never shifted by the viewer's offset.
//   - DATE_WITH_TIME (dueAtHasTime true): a real instant; its calendar day
//     is the day it falls on in the VIEWER's time zone.
//
// "Today" is always the viewer's local day. Every function takes the IANA
// time zone explicitly so nothing silently depends on the machine/runtime
// time zone; production callers pass resolveViewerTimeZone().

import type { Task } from '@/types';

// 'YYYY-MM-DD' — lexicographic order equals chronological order.
export type DayKey = string;

export type DueClass = 'none' | 'overdue' | 'today' | 'future';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatterCache.set(timeZone, f);
  }
  return f;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function resolveViewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Calendar day of an instant in the given IANA time zone.
export function localDayKey(instant: Date, timeZone: string): DayKey {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Intended calendar day of a task's due value, or null when undated.
export function dueDayKey(
  task:     Pick<Task, 'dueAt' | 'dueAtHasTime'>,
  timeZone: string,
): DayKey | null {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) return null;
  if (task.dueAtHasTime) return localDayKey(due, timeZone);
  return `${due.getUTCFullYear()}-${pad2(due.getUTCMonth() + 1)}-${pad2(due.getUTCDate())}`;
}

// Day-level classification against the viewer's today. A timed task due
// earlier today is 'today' (not 'overdue'): overdue means a previous day.
export function classifyDue(
  task:     Pick<Task, 'dueAt' | 'dueAtHasTime'>,
  now:      Date,
  timeZone: string,
): DueClass {
  const due = dueDayKey(task, timeZone);
  if (due === null) return 'none';
  const today = localDayKey(now, timeZone);
  if (due < today) return 'overdue';
  if (due > today) return 'future';
  return 'today';
}

// D1 Daily Progress + D2 Family Today. Pure, frontend-derived, node-test
// safe. No React / expo-* / react-native imports.
//
// Metric: completed missions OUT OF missions due today — NOT "missions
// completed today". A mission due today that was completed early (even on
// a previous day) still counts as completed; completedAt is irrelevant.
//
// Denominator: tasks with an assignee whose due day is the viewer's today
// (see src/domain/localDay.ts for date-only vs timed semantics). Overdue,
// undated, future and unclaimed open-to-anyone tasks are excluded. A task
// pending adult review (needs_attention) stays in the denominator.
// Numerator: tasks from that same set whose status is 'completed' (the
// approved / real-done state). Pending review is NOT done.

import { classifyDue } from '@/domain/localDay';
import type { Task } from '@/types';

export interface ProgressCount {
  completed: number;
  total:     number;
}

type ProgressTask = Pick<Task, 'assigneeId' | 'status' | 'dueAt' | 'dueAtHasTime'>;

function countDueToday(
  tasks:    readonly ProgressTask[],
  include:  (t: ProgressTask) => boolean,
  now:      Date,
  timeZone: string,
): ProgressCount {
  let completed = 0;
  let total = 0;
  for (const t of tasks) {
    if (!t.assigneeId || !include(t)) continue;
    if (classifyDue(t, now, timeZone) !== 'today') continue;
    total += 1;
    if (t.status === 'completed') completed += 1;
  }
  return { completed, total };
}

// D1 — one child's progress. A claimed open-to-anyone task has the child as
// assignee and is therefore included like any other assigned task.
export function selectDailyProgress(
  tasks:    readonly ProgressTask[],
  childId:  string,
  now:      Date,
  timeZone: string,
): ProgressCount {
  return countDueToday(tasks, (t) => t.assigneeId === childId, now, timeZone);
}

// D2 — Family Today. Same D1 rule applied to every assigned task in the
// household. Returns counts ONLY: no titles, Points, ranking or per-member
// breakdown leave this selector.
export function selectFamilyToday(
  tasks:    readonly ProgressTask[],
  now:      Date,
  timeZone: string,
): ProgressCount {
  const { completed, total } = countDueToday(tasks, () => true, now, timeZone);
  return { completed, total };
}

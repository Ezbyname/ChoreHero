// D6 — Next Mission (the child Home Hero: "What should I do now?"). Pure,
// frontend-derived, node-test safe.
//
// Deterministic priority (first non-empty tier wins):
//   1. sent_back        — own open task whose latest submission was rejected
//   2. overdue          — own task due on a previous day; earliest due first
//   3. due_today_timed  — own task due today with a time; earliest first
//   4. due_today        — own task due today, date-only
//   5. undated          — own task with no due date; oldest createdAt first
//   6. open_to_anyone   — unclaimed household task (fallback)
// Final tie-break in every tier: stable task id (ordinal).
//
// FUTURE-DUE tasks are excluded from every tier — the Hero never promotes a
// future task just to fill the space.
// Pending review (needs_attention) is not actionable. If no actionable
// mission exists but the child has tasks waiting for review, the result is
// 'waiting_for_review' so the UI can represent it calmly.

import { classifyDue, dueDayKey, type DueClass } from '@/domain/localDay';
import type { Task, TaskSubmissionSummary } from '@/types';

export type NextMissionReason =
  | 'sent_back'
  | 'overdue'
  | 'due_today_timed'
  | 'due_today'
  | 'undated'
  | 'open_to_anyone';

export type NextMissionResult =
  | { kind: 'mission'; task: Task; reason: NextMissionReason }
  | { kind: 'waiting_for_review'; pendingCount: number }
  | { kind: 'none' };

const TIER_ORDER: readonly NextMissionReason[] = [
  'sent_back',
  'overdue',
  'due_today_timed',
  'due_today',
  'undated',
  'open_to_anyone',
];

// Statuses a child can still act on. 'pending' / 'accepted' are app-only
// legacy states (see types/task.ts) and are treated like open work.
const ACTIONABLE = new Set<Task['status']>(['open', 'pending', 'accepted', 'in_progress']);

function compareIds(a: Task, b: Task): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function dueInstant(t: Task): number {
  const ms = t.dueAt ? new Date(t.dueAt).getTime() : Number.NaN;
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function createdInstant(t: Task): number {
  const ms = t.createdAt ? new Date(t.createdAt).getTime() : Number.NaN;
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

// Earliest due first: calendar day, then date-only before timed on the same
// day (a date-only due covers the whole day), then the timed instant.
function compareDue(timeZone: string) {
  return (a: Task, b: Task): number => {
    const da = dueDayKey(a, timeZone) ?? '￿';
    const db = dueDayKey(b, timeZone) ?? '￿';
    if (da !== db) return da < db ? -1 : 1;
    const ta = a.dueAtHasTime ? 1 : 0;
    const tb = b.dueAtHasTime ? 1 : 0;
    if (ta !== tb) return ta - tb;
    if (ta === 1) {
      const diff = dueInstant(a) - dueInstant(b);
      if (diff !== 0) return diff;
    }
    return 0;
  };
}

function ownTier(due: DueClass, task: Task, sentBack: boolean): NextMissionReason | null {
  if (due === 'future') return null;
  if (sentBack) return 'sent_back';
  if (due === 'overdue') return 'overdue';
  if (due === 'today') return task.dueAtHasTime ? 'due_today_timed' : 'due_today';
  return 'undated';
}

export function selectNextMission(input: {
  tasks:            readonly Task[];
  latestSubmission: ReadonlyMap<string, Pick<TaskSubmissionSummary, 'status'>>;
  childId:          string;
  now:              Date;
  timeZone:         string;
}): NextMissionResult {
  const { tasks, latestSubmission, childId, now, timeZone } = input;
  const buckets = new Map<NextMissionReason, Task[]>(TIER_ORDER.map((r) => [r, []]));
  let pendingCount = 0;

  for (const task of tasks) {
    if (task.assigneeId === childId) {
      if (task.status === 'needs_attention') { pendingCount += 1; continue; }
      if (!ACTIONABLE.has(task.status)) continue;
      const sentBack = task.status === 'open' && latestSubmission.get(task.id)?.status === 'rejected';
      const tier = ownTier(classifyDue(task, now, timeZone), task, sentBack);
      if (tier) buckets.get(tier)!.push(task);
    } else if (!task.assigneeId && task.status === 'open') {
      if (classifyDue(task, now, timeZone) === 'future') continue;
      buckets.get('open_to_anyone')!.push(task);
    }
  }

  const byDue = compareDue(timeZone);
  const comparators: Record<NextMissionReason, (a: Task, b: Task) => number> = {
    sent_back:       compareIds,
    overdue:         (a, b) => byDue(a, b) || compareIds(a, b),
    due_today_timed: (a, b) => byDue(a, b) || compareIds(a, b),
    due_today:       compareIds,
    undated:         (a, b) => (createdInstant(a) - createdInstant(b)) || compareIds(a, b),
    // Fallback mirrors the own-task date ordering (overdue/today before
    // undated, earliest due first), then id.
    open_to_anyone:  (a, b) => byDue(a, b) || compareIds(a, b),
  };

  for (const reason of TIER_ORDER) {
    const list = buckets.get(reason)!;
    if (list.length === 0) continue;
    const [task] = [...list].sort(comparators[reason]);
    return { kind: 'mission', task, reason };
  }

  if (pendingCount > 0) return { kind: 'waiting_for_review', pendingCount };
  return { kind: 'none' };
}

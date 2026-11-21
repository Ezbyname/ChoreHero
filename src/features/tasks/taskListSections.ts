// Pure list-building rules for Today / Assigned. No React — Node-test safe.

import { getTasksNeedingAttention, getUnassignedTasks } from '@/features/tasks/taskFilters';
import type { Task, TaskSubmissionSummary } from '@/types';

function isSameLocalDay(isoString: string, now: Date): boolean {
  const d = new Date(isoString);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export type TodaySections = {
  // "Waiting for your review" — only for a viewer who can approve.
  reviewTasks:  Task[];
  // Everything else Today shows (unassigned, due today, the child's own
  // waiting tasks). Never contains a task that is already in reviewTasks.
  generalTasks: Task[];
};

// Identity is the TASK ID: the DB allows at most one pending submission per
// task (uq_tcs_one_pending_per_task), so one actionable review item == one
// task. The same pending task used to be rendered twice for a reviewer —
// once in "Waiting for your review" and again in the general list (which
// also included every needs_attention task) — and approving one card made
// both disappear. The review section now takes precedence.
export function buildTodaySections(
  tasks:  readonly Task[],
  viewer: { canReview: boolean },
  now:    Date = new Date(),
): TodaySections {
  const reviewTasks = viewer.canReview ? getTasksNeedingAttention([...tasks]) : [];
  const inReview    = new Set(reviewTasks.map((t) => t.id));

  const attention  = viewer.canReview ? [] : getTasksNeedingAttention([...tasks]);
  const unassigned = getUnassignedTasks([...tasks]);
  const dueToday   = tasks.filter(
    (t) =>
      t.status !== 'completed' &&
      t.status !== 'needs_attention' &&
      t.assigneeId !== undefined &&
      t.dueAt !== undefined &&
      isSameLocalDay(t.dueAt, now),
  );

  const seen = new Set<string>();
  const generalTasks: Task[] = [];
  for (const task of [...attention, ...unassigned, ...dueToday]) {
    if (inReview.has(task.id) || seen.has(task.id)) continue;
    seen.add(task.id);
    generalTasks.push(task);
  }
  return { reviewTasks, generalTasks };
}

// Newest submission per task (submissions arrive newest-first, but this
// does not rely on it).
export function latestSubmissionByTask(submissions: readonly TaskSubmissionSummary[]): Map<string, TaskSubmissionSummary> {
  const latest = new Map<string, TaskSubmissionSummary>();
  for (const s of submissions) {
    const current = latest.get(s.taskId);
    if (!current || s.submittedAt > current.submittedAt) latest.set(s.taskId, s);
  }
  return latest;
}

// Photo count of each task's PENDING submission — metadata only, for the
// reviewer card badge. No evidence bytes are fetched for this.
export function pendingPhotoCountByTask(submissions: readonly TaskSubmissionSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of submissions) if (s.status === 'pending') counts.set(s.taskId, s.photoCount);
  return counts;
}

export type TaskStatusKey =
  | 'open'
  | 'open_to_anyone'
  | 'in_progress'
  | 'waiting_for_review'
  | 'completed'
  | 'needs_retry'
  | 'taken_back';

export type TaskStatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

// The real domain state of a task card: tasks.status is the workflow
// authority; the latest submission only refines an OPEN task (sent back by
// a reviewer, or taken back by the child).
export function deriveTaskStatus(
  task:   Pick<Task, 'status' | 'assigneeId'>,
  latest: Pick<TaskSubmissionSummary, 'status'> | undefined,
): { key: TaskStatusKey; tone: TaskStatusTone } {
  switch (task.status) {
    case 'completed':       return { key: 'completed', tone: 'success' };
    case 'needs_attention': return { key: 'waiting_for_review', tone: 'warning' };
    case 'in_progress':
    case 'accepted':        return { key: 'in_progress', tone: 'info' };
    default:
      if (!task.assigneeId) return { key: 'open_to_anyone', tone: 'neutral' };
      if (latest?.status === 'rejected')  return { key: 'needs_retry', tone: 'danger' };
      if (latest?.status === 'withdrawn') return { key: 'taken_back', tone: 'neutral' };
      return { key: 'open', tone: 'neutral' };
  }
}

// Slice 6B: Adult Tasks (Board 07 "Adult Tasks Final", Board 14 adult
// tokens). Pure and Node-test safe: no React, no react-native.
//
// The four segments come from the EXISTING task state rule,
// deriveTaskStatus (tasks.status is the workflow authority; the latest
// submission only refines an open task):
//   - Done:      completed
//   - Waiting:   waiting_for_review (tasks.status = 'needs_attention'), the
//                same items Adult Home lists as Mission review
//   - Sent back: needs_retry (open, latest submission rejected by a reviewer)
//   - Open:      everything else (open, open to anyone, in progress, taken
//                back by the child)
// No new task-state system.
//
// Which tasks: every household task in the store (the adult's RLS scope),
// so Waiting matches Adult Home's Needs attention exactly.
//
// Ordering: newest first by created_at, the order the old Assigned list
// used; a task without created_at goes last; ties keep store order.
//
// Row actions are the existing ones, each behind its existing permission:
//   - Waiting:            "Review" (tasks.approve_completion) → the Slice 6A
//                         AdultReview route. No decision is made in Tasks.
//   - Open, open to anyone: the existing claim ("I'll do this",
//                         tasks.claim_open). The old adult Home offered it.
//   - Open, assigned to the viewer: the existing direct "Complete"
//                         (tasks.complete), as the old My Tasks view did.
//   - Open, a child's task due today (Slice 6B.1): the existing direct
//                         "Complete" the old adult Home (TodayScreen) showed
//                         on its "Today's tasks" list. Same eligibility: the
//                         task is in buildTodaySections(...).generalTasks and
//                         TaskAdapter offers 'complete' (assigned, not
//                         completed, not waiting). Same path: completeTask →
//                         complete_task RPC (open → completed, no review; the
//                         RPC credits the Points to the caller, unchanged).
//                         Shown on Open rows only.
// There is no Edit, Archive or Delete (Board 07 / Board 17).
//
// Row scan order is fixed on every row (Board 07): title, assignee, due,
// state, Points. Points is the task's own Points value, never a balance.

import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { dueLabelFor, pointsOf } from '@/features/childHome/childHomeModel';
import { TaskAdapter } from '@/domain/adapters/taskActivityAdapter';
import { buildTodaySections, deriveTaskStatus, latestSubmissionByTask, type TaskStatusKey } from '@/features/tasks/taskListSections';
import type { HouseholdMember, Task, TaskSubmissionSummary } from '@/types';

export type TaskSegment = 'open' | 'waiting' | 'sent_back' | 'done';
export const TASK_SEGMENTS: readonly TaskSegment[] = ['open', 'waiting', 'sent_back', 'done'];

export type RowAction = 'review' | 'claim' | 'complete';

export type AdultTaskRow = {
  task:         Task;
  segment:      TaskSegment;
  stateKey:     TaskStatusKey;
  // 1. title
  title:        string;
  // 2. assignee ("Anyone" for an unclaimed open-to-anyone task)
  assigneeName: string;
  isAnyone:     boolean;
  // 3. due ("No due date" when there is none)
  dueLabel:     string;
  // 4. state: a word, always shown with an icon
  stateLabel:   string;
  // 5. Points (null when the task has none)
  points:       number | null;
  pointsLabel:  string | null;
  pointsA11y:   string | null;
  action:       RowAction | null;
  actionLabel:  string | null;
  actionA11yLabel: string | null;
  a11yLabel:    string;
};

export type AdultTasksPermissions = {
  canCreateTasks:   boolean; // tasks.create
  canReviewTasks:   boolean; // tasks.approve_completion
  canClaimOpen:     boolean; // tasks.claim_open
  canCompleteTasks: boolean; // tasks.complete
};

export type AdultTasksInput = {
  tasks:           readonly Task[];
  taskSubmissions: readonly TaskSubmissionSummary[];
  members:         readonly HouseholdMember[];
  viewerId:        string | null;
  permissions:     AdultTasksPermissions;
  now:             Date;
};

export type SegmentSummary = { key: TaskSegment; label: string; count: number; a11yLabel: string };

export type AdultTasksModel = {
  segments:  SegmentSummary[];
  rows:      Record<TaskSegment, AdultTaskRow[]>;
  canCreate: boolean;
};

export function segmentFor(key: TaskStatusKey): TaskSegment {
  switch (key) {
    case 'completed':          return 'done';
    case 'waiting_for_review': return 'waiting';
    case 'needs_retry':        return 'sent_back';
    default:                   return 'open';
  }
}

// The state word on a row. Open keeps the existing, more precise task
// words; the other segments use Board 07's words.
export function stateLabelFor(key: TaskStatusKey): string {
  switch (key) {
    case 'completed':          return copy.adultTasks.state.done;
    case 'waiting_for_review': return copy.adultTasks.state.waiting;
    case 'needs_retry':        return copy.adultTasks.state.sentBack;
    case 'open_to_anyone':     return copy.taskStatus.openToAnyone;
    case 'in_progress':        return copy.taskStatus.inProgress;
    case 'taken_back':         return copy.taskStatus.takenBack;
    default:                   return copy.taskStatus.open;
  }
}

function actionFor(
  task: Task, segment: TaskSegment, viewerId: string | null, p: AdultTasksPermissions, legacyDueToday: ReadonlySet<string>,
): RowAction | null {
  if (segment === 'waiting') return p.canReviewTasks ? 'review' : null;
  if (segment !== 'open') return null;
  if (!task.assigneeId) return p.canClaimOpen ? 'claim' : null;
  if (!p.canCompleteTasks) return null;
  if (viewerId && task.assigneeId === viewerId) return 'complete';
  return legacyDueToday.has(task.id) ? 'complete' : null;
}

// Slice 6B.1: the tasks the old adult Home offered a direct "Complete"
// on: its "Today's tasks" list (buildTodaySections, unchanged) where
// TaskAdapter's action is 'complete'.
export function legacyTodayCompleteIds(tasks: readonly Task[], canReview: boolean, now: Date): Set<string> {
  const { generalTasks } = buildTodaySections(tasks, { canReview }, now);
  return new Set(
    generalTasks
      .filter((t) => TaskAdapter.toFamilyActivity(t).availableActions.includes('complete'))
      .map((t) => t.id),
  );
}

const ACTION_LABEL: Record<RowAction, () => string> = {
  review:   () => copy.adultTasks.review,
  claim:    () => copy.activityCard.claimAction,
  complete: () => copy.activityCard.completeAction,
};

// Newest first by created_at; a task without one sorts after every dated
// task. Ties keep their store order.
export function orderTasks(tasks: readonly Task[]): Task[] {
  return tasks
    .map((task, i) => ({ task, i, at: task.createdAt ?? '' }))
    .sort((a, b) => (a.at === b.at ? a.i - b.i : a.at < b.at ? 1 : -1))
    .map((x) => x.task);
}

export function buildAdultTaskRow(
  task: Task,
  latest: TaskSubmissionSummary | undefined,
  input: Pick<AdultTasksInput, 'members' | 'viewerId' | 'permissions' | 'now'>,
  legacyDueToday: ReadonlySet<string> = new Set(),
): AdultTaskRow {
  const { key } = deriveTaskStatus(task, latest);
  const segment = segmentFor(key);
  const isAnyone = !task.assigneeId;
  const assigneeName = isAnyone
    ? copy.adultTasks.anyone
    : input.members.find((m) => m.userId === task.assigneeId)?.name ?? copy.adultHome.someone;
  const dueLabel = dueLabelFor(task, input.now) ?? copy.adultTasks.noDue;
  const stateLabel = stateLabelFor(key);
  const points = pointsOf(task);
  const action = actionFor(task, segment, input.viewerId, input.permissions, legacyDueToday);
  const actionLabel = action ? ACTION_LABEL[action]() : null;
  const pointsA11y = points === null ? null : formatCopy(copy.adultTasks.pointsA11y, { n: points });
  return {
    task,
    segment,
    stateKey: key,
    title: task.title,
    assigneeName,
    isAnyone,
    dueLabel,
    stateLabel,
    points,
    pointsLabel: points === null ? null : String(points),
    pointsA11y,
    action,
    actionLabel,
    actionA11yLabel: action ? `${actionLabel}: ${task.title}` : null,
    a11yLabel: [task.title, `${assigneeName} · ${dueLabel}`, stateLabel, pointsA11y].filter(Boolean).join('. '),
  };
}

export function buildAdultTasksModel(input: AdultTasksInput): AdultTasksModel {
  const latest = latestSubmissionByTask(input.taskSubmissions);
  const legacyDueToday = legacyTodayCompleteIds(input.tasks, input.permissions.canReviewTasks, input.now);
  const rows: Record<TaskSegment, AdultTaskRow[]> = { open: [], waiting: [], sent_back: [], done: [] };
  for (const task of orderTasks(input.tasks)) {
    const row = buildAdultTaskRow(task, latest.get(task.id), input, legacyDueToday);
    rows[row.segment].push(row);
  }
  const segments = TASK_SEGMENTS.map((key) => {
    const label = copy.adultTasks.segments[key];
    const count = rows[key].length;
    return { key, label, count, a11yLabel: formatCopy(count === 1 ? copy.adultTasks.segmentOneA11y : copy.adultTasks.segmentA11y, { label, n: count }) };
  });
  return { segments, rows, canCreate: input.permissions.canCreateTasks };
}

// ── Layout (Board 07 / 15 / 16) ─────────────────────────────────────────────
// The effective width is the window width divided by the font scale, so a
// larger font behaves like a narrower phone.
function effectiveWidth(windowWidth: number, fontScale: number): number {
  return windowWidth / Math.max(1, fontScale);
}

// Segments sit in a 2×2 grid on phones. Board 07 draws one row of four at
// ~12px, but at the adult title size (15) "Sent back" plus its real count
// does not fit a quarter of a 390dp phone, and text is never shrunk to
// force a fit (Board 16). One row only from 440dp of effective width.
export const SEGMENTS_ROW_MIN_WIDTH = 440;
export function segmentsInGrid(windowWidth: number, fontScale: number): boolean {
  return effectiveWidth(windowWidth, fontScale) < SEGMENTS_ROW_MIN_WIDTH;
}

// Board 16: a row's action goes full width at large text.
export const ACTION_INLINE_MIN_WIDTH = 340;
export function actionFullWidth(windowWidth: number, fontScale: number): boolean {
  return effectiveWidth(windowWidth, fontScale) < ACTION_INLINE_MIN_WIDTH;
}

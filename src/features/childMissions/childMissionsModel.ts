// Slice 5B: Child Missions view model (Board 03). Pure and Node-test safe.
//
// Three sections, built only from the approved selectors and card rules:
//   - To Do:   the child's own actionable tasks, then legitimate
//              open-to-anyone tasks (the same unclaimed-and-open rule the
//              child's Home uses). The first mission is selectNextMission's
//              pick (the Child Home priority), never re-ranked here. The
//              other rows keep the existing list order.
//   - Waiting: the child's own tasks waiting for a grown-up's review.
//   - Done:    the child's own completed tasks, "today" vs "earlier" by the
//              existing completed_at column. Quiet: no celebration state.
// Each row's action is childActionFor (the existing card actions), so every
// tap goes to an existing flow: TaskCompletionModal (complete / retry),
// claimOpenTask (claim) or PendingCompletionModal (manage).
//
// Privacy: a task assigned to someone else never enters any section, and a
// submission is only read for the child's own tasks.
// No XP, levels, streaks, badges or achievements exist in this model.

import { classifyDue, localDayKey } from '@/domain/localDay';
import {
  childActionFor,
  dueLabelFor,
  heroRibbonTone,
  pointsOf,
  type ChildHomeAction,
  type HeroRibbonTone,
} from '@/features/childHome/childHomeModel';
import { selectNextMission, type NextMissionReason } from '@/features/tasks/nextMission';
import { getUnassignedTasks } from '@/features/tasks/taskFilters';
import { latestSubmissionByTask } from '@/features/tasks/taskListSections';
import type { Task, TaskSubmissionSummary } from '@/types';

export type MissionsSection = 'todo' | 'waiting' | 'done';
export const MISSIONS_SECTIONS: readonly MissionsSection[] = ['todo', 'waiting', 'done'];

// Visual state of a To Do row. Semantics (Board 03 / Board 14):
//   ready          neutral row, indigo action
//   sent_back      indigo, encouraging ("Give it another go"), never red
//   overdue        warning amber, never success or error
//   open_to_anyone neutral, claim action
export type TodoState = 'ready' | 'sent_back' | 'overdue' | 'open_to_anyone';
export type MissionTone = 'neutral' | 'indigo' | 'warning' | 'waiting' | 'success';

export const TONE_FOR_STATE: Record<TodoState | 'waiting' | 'done', MissionTone> = {
  ready:          'neutral',
  sent_back:      'indigo',
  overdue:        'warning',
  open_to_anyone: 'neutral',
  waiting:        'waiting',
  done:           'success',
};

export type TodoMission = {
  task:     Task;
  action:   ChildHomeAction;
  state:    TodoState;
  points:   number | null;
  dueLabel: string | null;
};

export type FirstMission = TodoMission & { reason: NextMissionReason; ribbonTone: HeroRibbonTone };

export type WaitingMission = {
  task:       Task;
  points:     number | null;
  photoCount: number | null;
};

export type DoneMission = {
  task:   Task;
  points: number | null;
};

export type ChildMissionsModel = {
  first:   FirstMission | null;
  todo:    readonly TodoMission[];          // excludes `first`
  waiting: readonly WaitingMission[];
  doneToday:   readonly DoneMission[];
  doneEarlier: readonly DoneMission[];
  counts:  { todo: number; waiting: number; done: number };
};

export type ChildMissionsInput = {
  tasks:           readonly Task[];
  taskSubmissions: readonly TaskSubmissionSummary[];
  childId:         string;
  now:             Date;
  timeZone:        string;
};

function todoStateFor(task: Task, action: ChildHomeAction, now: Date, timeZone: string): TodoState {
  if (action === 'claim') return 'open_to_anyone';
  if (action === 'retry') return 'sent_back';
  return classifyDue(task, now, timeZone) === 'overdue' ? 'overdue' : 'ready';
}

function stateForReason(reason: NextMissionReason): TodoState {
  if (reason === 'sent_back') return 'sent_back';
  if (reason === 'overdue') return 'overdue';
  if (reason === 'open_to_anyone') return 'open_to_anyone';
  return 'ready';
}

export function buildChildMissionsModel(input: ChildMissionsInput): ChildMissionsModel {
  const { tasks, taskSubmissions, childId, now, timeZone } = input;
  const own = childId ? tasks.filter((t) => t.assigneeId === childId) : [];
  const ownIds = new Set(own.map((t) => t.id));
  // Only the child's own submissions are ever read.
  const latest = latestSubmissionByTask(taskSubmissions.filter((s) => ownIds.has(s.taskId)));

  const todoAll: TodoMission[] = [];
  const waiting: WaitingMission[] = [];
  const doneToday: DoneMission[] = [];
  const doneEarlier: DoneMission[] = [];
  const today = localDayKey(now, timeZone);

  for (const task of own) {
    if (task.status === 'completed') {
      const done = { task, points: pointsOf(task) };
      const at = task.completedAt ? new Date(task.completedAt) : null;
      if (at && !Number.isNaN(at.getTime()) && localDayKey(at, timeZone) === today) doneToday.push(done);
      else doneEarlier.push(done);
      continue;
    }
    const action = childActionFor(task, latest, childId);
    if (!action) continue;
    if (action === 'manage') {
      const pending = latest.get(task.id);
      waiting.push({ task, points: pointsOf(task), photoCount: pending?.status === 'pending' ? pending.photoCount : null });
      continue;
    }
    todoAll.push({ task, action, state: todoStateFor(task, action, now, timeZone), points: pointsOf(task), dueLabel: dueLabelFor(task, now) });
  }

  // Legitimate open-to-anyone tasks: the existing unclaimed-and-open rule.
  for (const task of getUnassignedTasks([...tasks])) {
    const action = childActionFor(task, latest, childId);
    if (action !== 'claim') continue;
    todoAll.push({ task, action, state: 'open_to_anyone', points: pointsOf(task), dueLabel: dueLabelFor(task, now) });
  }

  // The weighted first mission is the Child Home's next mission, so both
  // screens agree on "what should I do now?".
  const next = selectNextMission({ tasks, latestSubmission: latest, childId, now, timeZone });
  let first: FirstMission | null = null;
  if (next.kind === 'mission') {
    const row = todoAll.find((m) => m.task.id === next.task.id);
    if (row) first = { ...row, state: stateForReason(next.reason), reason: next.reason, ribbonTone: heroRibbonTone(next.reason) };
  }
  const todo = first ? todoAll.filter((m) => m.task.id !== first!.task.id) : todoAll;

  return {
    first,
    todo,
    waiting,
    doneToday,
    doneEarlier,
    counts: { todo: todoAll.length, waiting: waiting.length, done: doneToday.length + doneEarlier.length },
  };
}

// The section the screen opens on: To Do, unless only waiting work is left.
export function defaultMissionsSection(model: Pick<ChildMissionsModel, 'counts'>): MissionsSection {
  if (model.counts.todo === 0 && model.counts.waiting > 0) return 'waiting';
  return 'todo';
}

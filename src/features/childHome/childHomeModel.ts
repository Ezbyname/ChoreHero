// Slice 5A: Child Home view model. Pure and Node-test safe.
//
// Every number and decision on the Child Home comes from the approved
// selectors. This file only composes them, and never re-implements a rule:
//   - Points:          computeMyPointsSummary(...).available (Rewards' semantics)
//   - Daily progress:  selectDailyProgress   (Slice 1, D1)
//   - Hero:            selectNextMission     (Slice 1, D6 tiers)
//   - Suggested:       selectSuggestedReward (Slice 1, unaffordable only)
//   - Family Today:    selectFamilyToday     (Slice 1, D2, counts only)
//   - Secondary rows:  buildTodaySections + TaskAdapter + applyViewerTaskActions,
//     exactly the list and actions the child's Home showed before. They are
//     narrowed to the child's own and open-to-anyone tasks, so a sibling's
//     task title never shows here.
//
// No XP, levels, streaks, badges or achievements exist in this model.

import { formatDueDate } from '@/domain/dateFormat';
import { TaskAdapter } from '@/domain/adapters/taskActivityAdapter';
import { computeMyPointsSummary, selectReservedPendingSnapshots } from '@/features/rewards/pointsSummary';
import { selectSuggestedReward, type SuggestedReward } from '@/features/rewards/suggestedReward';
import { selectDailyProgress, selectFamilyToday, type ProgressCount } from '@/features/tasks/dailyProgress';
import { selectNextMission, type NextMissionReason } from '@/features/tasks/nextMission';
import { buildTodaySections, latestSubmissionByTask } from '@/features/tasks/taskListSections';
import { applyViewerTaskActions } from '@/features/tasks/taskViewerActions';
import type { Reward, RewardRedemption, Task, TaskSubmissionSummary } from '@/types';

// What the main button does. Each one maps to an existing flow:
//   - complete, retry: the child's TaskCompletionModal (request with photos)
//   - claim:           claimOpenTask
//   - manage:          the PendingCompletionModal (Change photos / Cancel)
export type ChildHomeAction = 'complete' | 'retry' | 'claim' | 'manage';

export type ChildHomeMission = {
  task:      Task;
  action:    ChildHomeAction;
  points:    number | null;
  dueLabel:  string | null;
};

export type ChildHomeHero =
  | { kind: 'mission'; reason: NextMissionReason; mission: ChildHomeMission }
  // Only pending work is left. A calm state with no call to action.
  | { kind: 'waiting'; pendingCount: number }
  // Nothing actionable. 'allDone' only when today's due missions are all
  // genuinely completed. Nothing is fabricated.
  | { kind: 'none'; allDone: boolean };

export type ChildHomeModel = {
  availablePoints: number;
  progress:        ProgressCount;
  leftToday:       number;
  hero:            ChildHomeHero;
  secondary:       readonly ChildHomeMission[];
  suggested:       SuggestedReward;
  familyToday:     ProgressCount;
};

export type ChildHomeInput = {
  tasks:           readonly Task[];
  taskSubmissions: readonly TaskSubmissionSummary[];
  rewards:         readonly Reward[];
  redemptions:     readonly RewardRedemption[];
  grossBalance:    number;
  childId:         string;
  now:             Date;
  timeZone:        string;
};

export function heroActionFor(reason: NextMissionReason): ChildHomeAction {
  if (reason === 'sent_back') return 'retry';
  if (reason === 'open_to_anyone') return 'claim';
  return 'complete';
}

// Hero ribbon semantics (vc14 Android QA gate: OVERDUE used the READY green).
// success = ready to do; warning (amber) = overdue, a nudge, never "done"
// and never an error; indigo = sent back for another try.
export type HeroRibbonTone = 'success' | 'warning' | 'indigo';

export function heroRibbonTone(reason: NextMissionReason): HeroRibbonTone {
  if (reason === 'sent_back') return 'indigo';
  if (reason === 'overdue') return 'warning';
  return 'success';
}

export function dueLabelFor(task: Pick<Task, 'dueAt' | 'dueAtHasTime'>, now: Date): string | null {
  if (!task.dueAt) return null;
  const f = formatDueDate(task.dueAt, task.dueAtHasTime, now);
  return f.timeLabel ? `${f.dateLabel} · ${f.timeLabel}` : f.dateLabel;
}

export function pointsOf(task: Task): number | null {
  return typeof task.points === 'number' && task.points > 0 ? task.points : null;
}

// The child's action on one task: the existing card actions
// (TaskAdapter + applyViewerTaskActions), with "complete" on a sent-back
// task shown as "retry". Shared by Child Home and Child Missions (Slice 5B).
export function childActionFor(
  task:    Task,
  latest:  ReadonlyMap<string, Pick<TaskSubmissionSummary, 'status'>>,
  childId: string,
): ChildHomeAction | null {
  const activity = applyViewerTaskActions(TaskAdapter.toFamilyActivity(task), {
    canApproveTaskCompletion: false, viewerId: childId, role: 'child',
  });
  const acts = activity.availableActions;
  if (acts.includes('manage_completion')) return 'manage';
  if (acts.includes('claim')) return 'claim';
  if (acts.includes('complete')) {
    return task.status === 'open' && latest.get(task.id)?.status === 'rejected' ? 'retry' : 'complete';
  }
  return null;
}

export function buildChildHomeModel(input: ChildHomeInput): ChildHomeModel {
  const { tasks, taskSubmissions, rewards, redemptions, grossBalance, childId, now, timeZone } = input;

  const { available: availablePoints } = computeMyPointsSummary(
    grossBalance,
    selectReservedPendingSnapshots(redemptions, childId),
  );

  const progress    = selectDailyProgress(tasks, childId, now, timeZone);
  const familyToday = selectFamilyToday(tasks, now, timeZone);
  const latest      = latestSubmissionByTask(taskSubmissions);

  const next = selectNextMission({ tasks, latestSubmission: latest, childId, now, timeZone });
  let hero: ChildHomeHero;
  if (next.kind === 'mission') {
    hero = {
      kind:   'mission',
      reason: next.reason,
      mission: { task: next.task, action: heroActionFor(next.reason), points: pointsOf(next.task), dueLabel: dueLabelFor(next.task, now) },
    };
  } else if (next.kind === 'waiting_for_review') {
    hero = { kind: 'waiting', pendingCount: next.pendingCount };
  } else {
    hero = { kind: 'none', allDone: progress.total > 0 && progress.completed === progress.total };
  }

  const heroId = hero.kind === 'mission' ? hero.mission.task.id : null;
  const sections = buildTodaySections(tasks, { canReview: false }, now);
  const secondary: ChildHomeMission[] = [];
  for (const task of sections.generalTasks) {
    if (task.id === heroId) continue;
    if (task.assigneeId && task.assigneeId !== childId) continue;    // never a sibling's task
    const action = childActionFor(task, latest, childId);
    if (!action) continue;
    secondary.push({ task, action, points: pointsOf(task), dueLabel: dueLabelFor(task, now) });
  }

  const suggested = selectSuggestedReward({ rewards, redemptions, viewerId: childId, availablePoints });

  return {
    availablePoints,
    progress,
    leftToday: Math.max(0, progress.total - progress.completed),
    hero,
    secondary,
    suggested,
    familyToday,
  };
}

// Small-phone layout (360×640 board): the progress moves into the header,
// and Family Today is left out so the hero stays above the fold.
export const COMPACT_HEIGHT_MAX = 700;
export function isCompactHeight(windowHeight: number): boolean {
  return windowHeight < COMPACT_HEIGHT_MAX;
}

// The check row draws one segment per mission. Above this many it becomes a
// plain bar, so segments never get too thin to read.
export const MAX_PROGRESS_SEGMENTS = 10;
export const MAX_FAMILY_DOTS = 20;

export function progressRatio(p: ProgressCount): number {
  return p.total > 0 ? Math.min(1, p.completed / p.total) : 0;
}

export function rewardRatio(available: number, required: number): number {
  return required > 0 ? Math.max(0, Math.min(1, available / required)) : 0;
}

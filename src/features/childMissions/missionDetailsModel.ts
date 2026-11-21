// Slice 5C: Child Mission Details view model (Board 19). Pure and Node-test
// safe.
//
// The detail route receives only a task id. Every render reads the task,
// its latest submission and the household members from the store and
// passes them here, so the screen always shows the current state, never a
// snapshot taken when the row was tapped. After a claim, for example, the
// same screen moves from "Open to anyone" to "To do" without navigation.
//
// Real fields only: title, description, Points, due date / time, who asked
// (the task's creator), the current state and one action. No XP, levels,
// streaks, badges, categories, difficulty, progress metrics or reviewer
// notes exist in this model.
//
// Each action is childActionFor (the existing card rules), so the screen
// reaches only existing flows: TaskCompletionModal (complete / retry),
// claimOpenTask (claim) and PendingCompletionModal (manage).
//
// Privacy: a task assigned to someone else is 'missing', exactly as if it
// did not exist. An unassigned task is visible only while it is
// legitimately open to anyone. Only the child's own submissions are read.

import { classifyDue } from '@/domain/localDay';
import { formatDueDate } from '@/domain/dateFormat';
import { childActionFor, dueLabelFor, pointsOf, type ChildHomeAction } from '@/features/childHome/childHomeModel';
import { getUnassignedTasks } from '@/features/tasks/taskFilters';
import { latestSubmissionByTask } from '@/features/tasks/taskListSections';
import type { HouseholdMember, Task, TaskSubmissionSummary } from '@/types';

export type MissionDetailsState = 'ready' | 'overdue' | 'sent_back' | 'open_to_anyone' | 'waiting' | 'done';

export type MissionDetails = {
  kind:        'mission';
  task:        Task;
  state:       MissionDetailsState;
  title:       string;
  description: string | null;
  points:      number | null;
  dueLabel:    string | null;
  askedBy:     string | null;
  // null: nothing to do here (done, or a status the child cannot act on).
  action:      ChildHomeAction | null;
  // Waiting only: the pending submission's photo count and send time.
  photoCount:  number | null;
  sentLabel:   string | null;
};

export type MissionDetailsModel = MissionDetails | { kind: 'missing' };

export type MissionDetailsInput = {
  taskId:          string;
  tasks:           readonly Task[];
  taskSubmissions: readonly TaskSubmissionSummary[];
  members:         readonly Pick<HouseholdMember, 'userId' | 'name'>[];
  childId:         string;
  now:             Date;
  timeZone:        string;
};

function sentLabelFor(submittedAt: string | undefined, now: Date): string | null {
  if (!submittedAt || Number.isNaN(new Date(submittedAt).getTime())) return null;
  const f = formatDueDate(submittedAt, true, now);
  return f.timeLabel ? `${f.dateLabel} · ${f.timeLabel}` : f.dateLabel;
}

function trimmed(text: string | undefined): string | null {
  const t = text?.trim();
  return t ? t : null;
}

export function buildMissionDetailsModel(input: MissionDetailsInput): MissionDetailsModel {
  const { taskId, tasks, taskSubmissions, members, childId, now, timeZone } = input;
  const task = tasks.find((t) => t.id === taskId);
  if (!task || !childId) return { kind: 'missing' };

  const own = task.assigneeId === childId;
  const openToAnyone = !own && getUnassignedTasks([task]).length === 1;
  if (!own && !openToAnyone) return { kind: 'missing' };

  const latest = latestSubmissionByTask(own ? taskSubmissions.filter((s) => s.taskId === task.id) : []);
  const askedBy = task.createdById ? members.find((m) => m.userId === task.createdById)?.name ?? null : null;
  const base = {
    kind:        'mission' as const,
    task,
    title:       task.title,
    description: trimmed(task.description),
    points:      pointsOf(task),
    dueLabel:    dueLabelFor(task, now),
    askedBy,
    photoCount:  null,
    sentLabel:   null,
  };

  if (own && task.status === 'completed') return { ...base, state: 'done', action: null };

  const action = childActionFor(task, latest, childId);
  if (action === 'claim') return { ...base, state: 'open_to_anyone', action };
  if (action === 'retry') return { ...base, state: 'sent_back', action };
  if (action === 'manage') {
    const pending = latest.get(task.id);
    const isPending = pending?.status === 'pending';
    return {
      ...base,
      state:      'waiting',
      action,
      photoCount: isPending ? pending.photoCount : null,
      sentLabel:  isPending ? sentLabelFor(pending.submittedAt, now) : null,
    };
  }
  // An unassigned task the child cannot claim is not theirs to see.
  if (!own) return { kind: 'missing' };
  const overdue = classifyDue(task, now, timeZone) === 'overdue';
  return { ...base, state: overdue ? 'overdue' : 'ready', action };
}

import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';
import type { Task, TaskStatus } from '@/types';

// Task's status union already matches FamilyActivity's ActivityStatus values
// (see types/task.ts) — an explicit map (rather than a cast) is kept so this
// breaks loudly at compile time if either union ever diverges.
const STATUS_MAP: Record<TaskStatus, FamilyActivity['status']> = {
  open:            'open',
  pending:         'pending',
  accepted:        'accepted',
  in_progress:     'in_progress',
  needs_attention: 'needs_attention',
  completed:       'completed',
};

function availableActionsFor(task: Task): ActivityAction[] {
  if (task.status === 'completed') return [];
  if (!task.assigneeId) return ['claim'];
  return ['complete'];
}

export const TaskAdapter = {
  toFamilyActivity(task: Task): FamilyActivity {
    const availableActions = availableActionsFor(task);

    return {
      id:                 task.id,
      kind:               'task',
      title:              task.title,
      description:        task.description,
      householdId:        task.householdId,
      createdByProfileId: task.createdById,
      targetProfileId:    task.assigneeId,
      status:             STATUS_MAP[task.status],
      dueAt:              task.dueAt,
      points:             task.points,
      requiresApproval:   false,
      availableActions,
    };
  },
};

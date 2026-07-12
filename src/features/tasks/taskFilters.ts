import type { Task } from '@/types';

export function getTasksForUser(tasks: Task[], userId: string): Task[] {
  return tasks.filter((t) => t.assigneeId === userId && t.status !== 'completed');
}

export function getUnassignedTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.assigneeId && t.status === 'open');
}

export function getTasksNeedingAttention(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === 'needs_attention');
}

export function getActiveTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status !== 'completed');
}

// "Assigned by me" — tasks this profile authored, regardless of who (if
// anyone) it's assigned to. Distinct from getTasksForUser, which is about
// tasks assigned TO a profile.
export function getTasksCreatedByUser(tasks: Task[], userId: string): Task[] {
  return tasks.filter((t) => t.createdById === userId);
}

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

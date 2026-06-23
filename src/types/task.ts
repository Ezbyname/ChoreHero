export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus =
  | 'open'
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'needs_attention';

export interface Task {
  id: string;
  title: string;
  description?: string;
  assigneeId?: string;
  createdById?: string;
  householdId?: string;
  dueAt?: string;
  priority: TaskPriority;
  status: TaskStatus;
  points?: number;
}

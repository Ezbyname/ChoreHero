// priority is not present in the database schema (T1.4.4).
// It remains optional for mock seed backward compatibility.
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// DB task_status enum: open | in_progress | needs_attention | completed
// 'pending' and 'accepted' exist in the app type only (legacy / future states).
export type TaskStatus =
  | 'open'
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'needs_attention';

export interface Task {
  id:           string;
  title:        string;
  description?: string;
  assigneeId?:  string;
  createdById?: string;
  householdId?: string;
  dueAt?:       string;
  priority?:    TaskPriority; // optional: not stored in DB
  status:       TaskStatus;
  points?:      number;
}

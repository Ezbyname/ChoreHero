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
  // Discriminator for dueAt: true = date+time was explicitly supplied,
  // false = date-only (all-day). Never inferred from dueAt's shape — see
  // src/domain/dateFormat.ts. Absent/undefined for a legacy row whose
  // due_at predates this column; formatDueDate treats that the same as
  // false (date-only), the safer fallback.
  dueAtHasTime?: boolean;
  priority?:    TaskPriority; // optional: not stored in DB
  status:       TaskStatus;
  points?:      number;
}

// Task Completion Photo Proof — Slice 1 (schema only; no RPC/mutation path
// exists yet). One row per completion attempt, not per task — tasks.status
// remains the workflow authority. See
// supabase/migrations/20260906000000_task_completion_submissions_schema.sql.
export type TaskCompletionSubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface TaskCompletionSubmission {
  id:                    string;
  taskId:                string;
  householdId:           string;
  submittedByProfileId:  string;
  clientRequestId:       string;
  photoStoragePath?:     string;
  status:                TaskCompletionSubmissionStatus;
  reviewedByProfileId?:  string;
  reviewedAt?:           string;
  submittedAt:           string;
  createdAt:             string;
  updatedAt:             string;
}

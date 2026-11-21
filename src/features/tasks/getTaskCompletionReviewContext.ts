import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { getPendingTaskCompletionSubmissionForTask } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

// Minimal projection of a pending task_completion_submissions row that the
// reviewer UI actually needs. The underlying row's photo_storage_path
// NEVER leaves this feature boundary: the UI gets `hasPhoto: boolean` and
// derives all evidence access through fetchTaskCompletionEvidence
// (submissionId only), per the approved security contract.
export interface TaskCompletionReviewContext {
  submissionId:         string;
  taskId:               string;
  submittedByProfileId: string;
  submittedAt:          string;
  hasPhoto:             boolean;
  // How many evidence photos (0..5). Metadata only. Absent on contexts built
  // before multi-photo; then hasPhoto ? 1 : 0 (see evidencePhotoCount).
  photoCount?:          number;
}

export function evidencePhotoCount(context: Pick<TaskCompletionReviewContext, 'hasPhoto' | 'photoCount'>): number {
  if (!context.hasPhoto) return 0;
  return Math.max(1, context.photoCount ?? 1);
}

export type TaskCompletionReviewContextResult =
  | { ok: true;  data:  TaskCompletionReviewContext }
  | { ok: false; reason: 'not_found' | 'not_authorized' | 'failed' };

interface Input {
  taskId: string;
  role:   string | null;
}

// Resolves the single pending submission for a task on demand. Called by
// the reviewer Modal when the reviewer taps Approve or Decline on a
// needs_attention card — there is no global pendingSubmissions store, by
// design (approved B.2 architecture). Permission is gated client-side via
// `tasks.approve_completion` (same as the shipped reviewer surface); the
// server-side RLS policy is still the real authorization boundary.
export async function getTaskCompletionReviewContext(
  input: Input,
): Promise<TaskCompletionReviewContextResult> {
  if (!hasHouseholdPermission(input.role, 'tasks.approve_completion')) {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    // Mock-mode: match the shipped mock-mode conventions elsewhere in
    // this layer (completeTask / approveTaskCompletion both branch here).
    // No pending submission exists in the mock seed, so the reviewer
    // Modal lands in `not_found` and may still proceed to approve/reject
    // the task via its own mock paths — this file's job is only to
    // report what it saw.
    const task = useAppStore.getState().tasks.find((t) => t.id === input.taskId);
    if (!task || task.status !== 'needs_attention') {
      return { ok: false, reason: 'not_found' };
    }
    // Synthetic context for mock mode so a reviewer can still see the
    // Modal UX in dev. hasPhoto=false means no evidence fetch is issued,
    // matching the actual no-photo flow and the fact that mock mode
    // never produces real Storage objects.
    return {
      ok: true,
      data: {
        submissionId:         `mock-submission-${task.id}`,
        taskId:               task.id,
        submittedByProfileId: task.assigneeId ?? '',
        submittedAt:          new Date().toISOString(),
        hasPhoto:             false,
        photoCount:           0,
      },
    };
  }

  const { data, error } = await getPendingTaskCompletionSubmissionForTask(input.taskId);
  if (error) return { ok: false, reason: 'failed' };
  if (!data)  return { ok: false, reason: 'not_found' };

  return {
    ok: true,
    data: {
      submissionId:         data.id,
      taskId:               data.task_id,
      submittedByProfileId: data.submitted_by_profile_id,
      submittedAt:          data.submitted_at,
      // The only use of photo_storage_path at this feature boundary:
      // narrow it to a boolean. The UI must NEVER see or construct the
      // raw path — evidence bytes are read through
      // fetchTaskCompletionEvidence(submissionId) exclusively.
      hasPhoto:             data.photo_storage_path !== null,
      photoCount:           data.photo_count ?? (data.photo_storage_path !== null ? 1 : 0),
    },
  };
}

import type { FamilyActivity } from '@/domain/familyActivity';

// Viewer-specific post-processing of TaskAdapter's viewer-agnostic actions,
// shared by Today and My Tasks (it replaces the identical inline filter
// both screens had).
//
//   - Privileged reviewers (canApproveTaskCompletion) see the adapter's
//     actions unchanged ('approve' / 'decline' on needs_attention).
//   - Everyone else never sees 'approve' / 'decline'.
//   - The submitting CHILD, looking at their OWN needs_attention task, gets
//     'manage_completion' (Add/Change photo, Cancel completion). The server
//     re-checks all of this in withdraw_task_completion_v2; this only
//     decides which button is drawn.
export function applyViewerTaskActions(
  activity: FamilyActivity,
  viewer:   { canApproveTaskCompletion: boolean; viewerId: string | null; role: string | null },
): FamilyActivity {
  if (viewer.canApproveTaskCompletion) return activity;
  const isOwnWaitingTask =
    viewer.role === 'child' &&
    viewer.viewerId !== null &&
    activity.kind === 'task' &&
    activity.status === 'needs_attention' &&
    activity.targetProfileId === viewer.viewerId;
  if (isOwnWaitingTask) return { ...activity, availableActions: ['manage_completion'] };
  return {
    ...activity,
    availableActions: activity.availableActions.filter((a) => a !== 'approve' && a !== 'decline'),
  };
}

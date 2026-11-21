import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { rejectTaskCompletionV2, getTasksForHousehold } from '@/lib/repositories';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import type { RefreshReason } from '@/features/sync/refreshScheduler';
import { useAppStore } from '@/store/useAppStore';

// V2 analogue of src/features/tasks/rejectTaskCompletion.ts. Error-code
// surface from reject_task_completion_v2 is identical to approve's:
//   28000 → 'not_authorized'
//   CH017 → 'not_pending'
//   CH019 → 'failed'
//   anything else → 'failed'
// Reject does NOT touch points, so no balances refresh is required.
//
// Refresh semantics after a SUCCESSFUL mutation — identical rule as
// approveTaskCompletionSubmission (see that file's header): once
// reject_task_completion_v2 returns success the server task has
// transitioned (needs_attention → open), and a subsequent
// getTasksForHousehold failure MUST NOT surface as action failure. The
// wrapper always returns `{ ok: true }` for a committed mutation; on
// refresh failure it mirrors the known server transition locally and
// requests a background household refresh for authoritative recovery
// (never a full re-hydration). CH017 requests a 'stale' refresh so the
// reviewer's stale card goes away.
const NOT_PENDING_CODE = 'CH017';
const NOT_AUTH_CODE    = '28000';

export type RejectTaskCompletionSubmissionResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_pending' | 'failed' };

interface Input {
  submissionId: string;
  taskId:       string;
  householdId:  string;
  role:         string | null;
}

// Test seam only. Production callers pass no deps.
export interface RejectDeps {
  rejectFn?:   typeof rejectTaskCompletionV2;
  getTasksFn?: typeof getTasksForHousehold;
  requestRefresh?: (reason: RefreshReason) => unknown;
}

export async function rejectTaskCompletionSubmission(
  input: Input,
  deps:  RejectDeps = {},
): Promise<RejectTaskCompletionSubmissionResult> {
  if (!hasHouseholdPermission(input.role, 'tasks.reject_completion')) {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    // Mock-mode mirrors V1 wrapper — flip needs_attention → open.
    const { tasks, setTasks } = useAppStore.getState();
    const task = tasks.find((t) => t.id === input.taskId);
    if (!task || task.status !== 'needs_attention') {
      return { ok: false, reason: 'not_pending' };
    }
    setTasks(tasks.map((t) => (t.id === input.taskId ? { ...t, status: 'open' } : t)));
    return { ok: true };
  }

  const rejectFn       = deps.rejectFn       ?? rejectTaskCompletionV2;
  const getTasksFn     = deps.getTasksFn     ?? getTasksForHousehold;
  const requestRefresh = deps.requestRefresh ?? requestHouseholdRefresh;

  const rejected = await rejectFn(input.submissionId);
  if (rejected.error) {
    const reason: 'not_authorized' | 'not_pending' | 'failed' =
      rejected.error.code === NOT_PENDING_CODE ? 'not_pending'
      : rejected.error.code === NOT_AUTH_CODE  ? 'not_authorized'
      : 'failed';
    if (reason === 'not_pending') requestRefresh('stale');
    return { ok: false, reason };
  }

  // Authoritative mutation committed — see approve wrapper's header for
  // the full rationale on why a refresh failure must NOT become an action
  // failure (retrying would hit CH017 for an already-reviewed submission).
  const store = useAppStore.getState();

  const refreshed = await getTasksFn(input.householdId);
  if (!refreshed.error) {
    store.setTaskRows(refreshed.data);
  } else {
    reconcileTaskStatusLocally(input.taskId, 'open');
    requestRefresh('mutation');
  }

  return { ok: true };
}

function reconcileTaskStatusLocally(
  taskId: string,
  nextStatus: 'completed' | 'open',
): void {
  const { tasks, setTasks } = useAppStore.getState();
  setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));
}

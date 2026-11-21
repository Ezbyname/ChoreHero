import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import {
  approveTaskCompletionV2,
  getPointsBalancesForHousehold,
  getTasksForHousehold,
} from '@/lib/repositories';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import type { RefreshReason } from '@/features/sync/refreshScheduler';
import { useAppStore } from '@/store/useAppStore';

// V2 analogue of src/features/tasks/approveTaskCompletion.ts. Called by
// the reviewer Modal after the reviewer confirms. Submission id is the
// identity under V2 — the task UPDATE is driven server-side by the
// approve_task_completion_v2 RPC via that submission's own task_id, so
// taskId is a client-side convenience for post-success refresh only.
//
// The permission string is the SAME `tasks.approve_completion` the V1
// wrapper already uses — role gating does not change across V1/V2; only
// the RPC and the row-identity change.
//
// Error-code mapping, from the V2 approve RPC's documented ERRCODEs:
//   28000 → 'not_authorized' (collapsed "not auth / not in household / submission not found")
//   CH017 → 'not_pending'    (submission is no longer pending review — e.g. already approved/rejected)
//   CH019 → 'failed'         (workflow invariant violation; defensive)
//   anything else            → 'failed'
//
// Refresh semantics after a SUCCESSFUL mutation (load-bearing):
//
//   The V2 RPC is the authoritative mutation. Once it returns success the
//   task has transitioned on the server (needs_attention → completed) and
//   points have been awarded atomically with that transition. Any subsequent
//   client-side read failure (getTasksForHousehold / getPointsBalancesForHousehold)
//   MUST NOT be surfaced as an action failure — retrying the mutation would
//   now hit CH017 and the user would see a terminal error for a decision
//   that actually committed. Instead:
//     - targeted refresh succeeds → apply it;
//     - targeted refresh fails    → mirror the known server transition
//                                   locally (status → 'completed' on the one
//                                   task) and request a background
//                                   household refresh (householdRefresh.ts)
//                                   to restore authoritative state. Never a
//                                   full re-hydration: that remounts the
//                                   navigator behind a loading screen.
//
// CH017 (not pending any more — e.g. the child withdrew while this
// reviewer's screen was stale) also requests a refresh ('stale'), so the
// stale card disappears even if the Realtime event was missed.
//   The wrapper always returns `{ ok: true }` for a committed mutation.
//   Points are NEVER synthesized on failure — the exact post-award balance
//   is unknown to the client; hydration will fetch the authoritative figure.
const NOT_PENDING_CODE  = 'CH017';
const NOT_AUTH_CODE     = '28000';

export type ApproveTaskCompletionSubmissionResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_pending' | 'failed' };

interface Input {
  submissionId: string;
  taskId:       string;
  householdId:  string;
  role:         string | null;
}

// Test seam only. Production callers pass no deps and get the real
// repository functions. Matches the pattern already used by
// submitTaskCompletionWithEvidence — the Modal (production caller)
// never supplies these.
export interface ApproveDeps {
  approveFn?:   typeof approveTaskCompletionV2;
  getTasksFn?:  typeof getTasksForHousehold;
  getPointsFn?: typeof getPointsBalancesForHousehold;
  requestRefresh?: (reason: RefreshReason) => unknown;
}

export async function approveTaskCompletionSubmission(
  input: Input,
  deps:  ApproveDeps = {},
): Promise<ApproveTaskCompletionSubmissionResult> {
  if (!hasHouseholdPermission(input.role, 'tasks.approve_completion')) {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    // Mock-mode mirrors V1 wrapper exactly — flip needs_attention →
    // completed in the store, award points to assignee. The reviewer
    // Modal never actually calls the real RPC in mock mode.
    const { tasks, setTasks, pointsBalances, setPointsBalances } = useAppStore.getState();
    const task = tasks.find((t) => t.id === input.taskId);
    if (!task || task.status !== 'needs_attention') {
      return { ok: false, reason: 'not_pending' };
    }
    setTasks(tasks.map((t) => (t.id === input.taskId ? { ...t, status: 'completed' } : t)));
    if (task.assigneeId) {
      const awarded  = task.points ?? 0;
      const existing = pointsBalances.find((pb) => pb.userId === task.assigneeId);
      setPointsBalances(
        existing
          ? pointsBalances.map((pb) =>
              pb.userId === task.assigneeId ? { ...pb, balance: pb.balance + awarded } : pb,
            )
          : [...pointsBalances, { userId: task.assigneeId, householdId: task.householdId ?? input.householdId, balance: awarded }],
      );
    }
    return { ok: true };
  }

  const approveFn      = deps.approveFn      ?? approveTaskCompletionV2;
  const getTasksFn     = deps.getTasksFn     ?? getTasksForHousehold;
  const getPointsFn    = deps.getPointsFn    ?? getPointsBalancesForHousehold;
  const requestRefresh = deps.requestRefresh ?? requestHouseholdRefresh;

  const approved = await approveFn(input.submissionId);
  if (approved.error) {
    const reason: 'not_authorized' | 'not_pending' | 'failed' =
      approved.error.code === NOT_PENDING_CODE ? 'not_pending'
      : approved.error.code === NOT_AUTH_CODE  ? 'not_authorized'
      : 'failed';
    if (reason === 'not_pending') requestRefresh('stale');
    return { ok: false, reason };
  }

  // Authoritative mutation committed — everything below is best-effort
  // local reconciliation and must never cause `{ ok: false }`.
  const store = useAppStore.getState();

  const refreshed = await getTasksFn(input.householdId);
  if (!refreshed.error) {
    store.setTaskRows(refreshed.data);
  } else {
    // Targeted refresh failed. Mirror the server's known transition
    // locally on exactly the one known task, then ask for a background
    // refresh to restore authoritative state.
    reconcileTaskStatusLocally(input.taskId, 'completed');
    requestRefresh('mutation');
  }

  const refreshedBalances = await getPointsFn(input.householdId);
  if (!refreshedBalances.error) {
    store.setPointsBalanceRows(refreshedBalances.data);
  } else {
    // Points refresh failed. We DO NOT synthesize a balance (the exact
    // post-award figure is server-authoritative and unknown here); just
    // ask for a background refresh. Coalesced with the one above.
    requestRefresh('mutation');
  }

  return { ok: true };
}

// Local mirror of a known-committed server task-status transition. Used
// only on the fallback path where the authoritative refresh failed — the
// mutation already committed server-side, so this write is a conservative
// mirror of what the next hydration will return anyway.
function reconcileTaskStatusLocally(
  taskId: string,
  nextStatus: 'completed' | 'open',
): void {
  const { tasks, setTasks } = useAppStore.getState();
  setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));
}

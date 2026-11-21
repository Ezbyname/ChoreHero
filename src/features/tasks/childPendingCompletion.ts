import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import {
  getPendingTaskCompletionSubmissionForTask,
  getTasksForHousehold,
  withdrawTaskCompletionV2,
} from '@/lib/repositories';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import type { RefreshReason } from '@/features/sync/refreshScheduler';
import { useAppStore } from '@/store/useAppStore';

// Child-side counterpart of getTaskCompletionReviewContext +
// approve/rejectTaskCompletionSubmission, for the "waiting for review"
// card: look up the child's OWN pending submission, and withdraw it.
//
// Withdrawal is the only server mutation here and it goes exclusively
// through withdraw_task_completion_v2 — never reviewer Reject, never a
// direct table/Storage write. Add/Change photo is "withdraw, then a NEW
// logical attempt" (fresh clientRequestId + photoObjectId minted by the
// completion Modal); nothing here edits a submission in place.

export interface ChildPendingCompletion {
  submissionId: string;
  // Narrowed from photo_storage_path / photo_count; the raw path never
  // leaves this file. photoCount drives the read-only "what I sent" gallery.
  hasPhoto:     boolean;
  photoCount:   number;
}

export type GetChildPendingCompletionResult =
  | { ok: true;  data: ChildPendingCompletion }
  | { ok: false; reason: 'not_found' | 'not_authorized' | 'failed' };

export async function getChildPendingCompletion(
  input: { taskId: string; role: string | null },
  deps:  {
    getPendingFn?:   typeof getPendingTaskCompletionSubmissionForTask;
    requestRefresh?: (reason: RefreshReason) => unknown;
  } = {},
): Promise<GetChildPendingCompletionResult> {
  if (input.role !== 'child') return { ok: false, reason: 'not_authorized' };
  if (!isSupabaseConfigured)   return { ok: false, reason: 'not_found' };

  const getPendingFn   = deps.getPendingFn   ?? getPendingTaskCompletionSubmissionForTask;
  const requestRefresh = deps.requestRefresh ?? requestHouseholdRefresh;
  // RLS (task_completion_submissions_select_self_or_adult_plus) lets a
  // child read only their own submissions; the index guarantees at most
  // one pending row per task.
  const { data, error } = await getPendingFn(input.taskId);
  if (error) return { ok: false, reason: 'failed' };
  if (!data) {
    // The card said "waiting for review" but nothing is pending any more:
    // the adult already decided (or the child withdrew elsewhere). This
    // screen is stale — fetch the real task state so the card turns back
    // into whatever the server says (e.g. "Sent back — needs another try",
    // actionable again) instead of leading here again.
    requestRefresh('stale');
    return { ok: false, reason: 'not_found' };
  }
  const hasPhoto = data.photo_storage_path !== null;
  return {
    ok: true,
    data: { submissionId: data.id, hasPhoto, photoCount: data.photo_count ?? (hasPhoto ? 1 : 0) },
  };
}

const NOT_PENDING_CODE = 'CH017';
const NOT_AUTH_CODE    = '28000';

export type WithdrawChildCompletionResult =
  | { ok: true }
  | { ok: false; reason: 'not_pending' | 'not_authorized' | 'failed' };

export async function withdrawChildPendingCompletion(
  input: { submissionId: string; taskId: string; householdId: string; role: string | null },
  deps:  {
    withdrawFn?: typeof withdrawTaskCompletionV2;
    getTasksFn?: typeof getTasksForHousehold;
    requestRefresh?: (reason: RefreshReason) => unknown;
  } = {},
): Promise<WithdrawChildCompletionResult> {
  if (input.role !== 'child') return { ok: false, reason: 'not_authorized' };
  if (!isSupabaseConfigured)   return { ok: false, reason: 'failed' };

  const withdrawFn     = deps.withdrawFn     ?? withdrawTaskCompletionV2;
  const getTasksFn     = deps.getTasksFn     ?? getTasksForHousehold;
  const requestRefresh = deps.requestRefresh ?? requestHouseholdRefresh;

  const withdrawn = await withdrawFn(input.submissionId);
  if (withdrawn.error) {
    const reason = withdrawn.error.code === NOT_PENDING_CODE ? 'not_pending'
                 : withdrawn.error.code === NOT_AUTH_CODE    ? 'not_authorized'
                 : 'failed';
    // Already reviewed elsewhere: this screen is stale.
    if (reason === 'not_pending') requestRefresh('stale');
    return { ok: false, reason };
  }
  // Defensive: success must mean the row is withdrawn (fresh or replay).
  if (withdrawn.data.status !== 'withdrawn') return { ok: false, reason: 'failed' };

  // Committed — reconciliation below is best-effort and never turns the
  // result into a failure (same rule as approveTaskCompletionSubmission).
  const store = useAppStore.getState();
  const refreshed = await getTasksFn(input.householdId);
  if (!refreshed.error) {
    store.setTaskRows(refreshed.data);
  } else {
    store.setTasks(store.tasks.map((t) => (t.id === input.taskId ? { ...t, status: 'open' } : t)));
  }
  // Submission metadata (status / photo counts) follows in the background.
  requestRefresh('mutation');
  return { ok: true };
}

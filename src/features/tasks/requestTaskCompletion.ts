import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { requestTaskCompletion as requestTaskCompletionRpc, getTasksForHousehold } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

// Dedicated ERRCODE the RPC raises when the task is not 'open', or is no
// longer assigned to this caller, at the moment of the update — see
// supabase/migrations/20260721000000_request_task_completion.sql. Every
// other RPC failure (including the RPC's own defense-in-depth 28000 for
// wrong role/wrong assignee) collapses to 'failed', matching how
// completeTask.ts already treats its own equivalent defense-in-depth
// case — the client-side gate below is what actually surfaces
// 'not_authorized' in real-mode operation.
const NOT_OPEN_CODE = 'CH003';

export type RequestTaskCompletionResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_open' | 'failed' };

interface RequestTaskCompletionInput {
  taskId:      string;
  householdId: string;
  // Used only by the mock-data branch below, to compare against the
  // task's own assignee. The real RPC path ignores this entirely and
  // always derives the caller from auth.uid() itself — there is no way
  // to submit a completion request on someone else's behalf.
  profileId:   string;
  role:        string | null;
}

// tasks.complete is granted to all four roles including child
// (src/domain/permissions.ts) — the permission alone does not distinguish
// this review-required child submission from EX-05's privileged direct
// completion. This function is child-only: a privileged caller is
// rejected here with the same 'not_authorized' reason used for any other
// permission failure in this codebase — they should route through
// completeTask instead (docs/task-state-contract.md §8).
//
// Assignment-authorization policy (approved product decision, "Option A
// — assigned child only"): only the task's own assignee may submit.
// A different child in the same household is not authorized, even
// though tasks.complete is granted to them too — the mock-mode branch
// below checks this directly; the real-mode RPC enforces the same rule
// server-side (see the migration's own comment for the full rationale).
export async function requestTaskCompletion(
  input: RequestTaskCompletionInput,
): Promise<RequestTaskCompletionResult> {
  if (!hasHouseholdPermission(input.role, 'tasks.complete') || input.role !== 'child') {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    const { tasks, setTasks } = useAppStore.getState();
    const task = tasks.find((t) => t.id === input.taskId);

    if (!task || task.status !== 'open') {
      return { ok: false, reason: 'not_open' };
    }
    if (task.assigneeId !== input.profileId) {
      return { ok: false, reason: 'not_authorized' };
    }

    setTasks(tasks.map((t) => (t.id === input.taskId ? { ...t, status: 'needs_attention' } : t)));
    return { ok: true };
  }

  const requested = await requestTaskCompletionRpc(input.taskId);

  if (requested.error) {
    const reason = requested.error.code === NOT_OPEN_CODE ? 'not_open' : 'failed';
    return { ok: false, reason };
  }

  const refreshed = await getTasksForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setTaskRows(refreshed.data);
  return { ok: true };
}

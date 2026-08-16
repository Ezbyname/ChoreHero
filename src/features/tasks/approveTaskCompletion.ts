import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { approveTaskCompletion as approveTaskCompletionRpc, getPointsBalancesForHousehold, getTasksForHousehold } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

// Dedicated ERRCODE the RPC raises when the task is not 'needs_attention'
// at the moment of the update — see
// supabase/migrations/20260801000000_approve_reject_task_completion.sql.
// Every other RPC failure collapses to 'failed'; only this one outcome
// gets a specific message, matching the approved scope.
const NOT_PENDING_CODE = 'CH004';

export type ApproveTaskCompletionResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_pending' | 'failed' };

interface ApproveTaskCompletionInput {
  taskId:      string;
  householdId: string;
  role:        string | null;
}

// Privileged (owner/admin/adult) review of a child's completion request.
// EX-07 — see docs/task-state-contract.md §§9,11. Sets status to
// 'completed' and, per the approved worker-credit rule,
// completed_by_profile_id to the task's own assignee — never to the
// approving adult. Applies to any needs_attention task in the household
// the actor is privileged in, matching completeTask's own "any task,
// not just their own" scope, not requestTaskCompletion's assignee-only
// scope.
export async function approveTaskCompletion(
  input: ApproveTaskCompletionInput,
): Promise<ApproveTaskCompletionResult> {
  if (!hasHouseholdPermission(input.role, 'tasks.approve_completion')) {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    const { tasks, setTasks, pointsBalances, setPointsBalances } = useAppStore.getState();
    const task = tasks.find((t) => t.id === input.taskId);
    if (!task || task.status !== 'needs_attention') {
      return { ok: false, reason: 'not_pending' };
    }

    setTasks(
      tasks.map((t) => (t.id === input.taskId ? { ...t, status: 'completed' } : t)),
    );

    // EX-10: award points to the task's own assignee (worker credit — the
    // approving adult is never credited), mirroring the real RPC's
    // completed_by_profile_id = v_task.assignee_profile_id and its
    // points_balances upsert.
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

  const approved = await approveTaskCompletionRpc(input.taskId);

  if (approved.error) {
    const reason = approved.error.code === NOT_PENDING_CODE ? 'not_pending' : 'failed';
    return { ok: false, reason };
  }

  const refreshed = await getTasksForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setTaskRows(refreshed.data);

  // Best-effort refresh — see completeTask.ts's identical comment: the
  // completion + points award already committed atomically server-side.
  const refreshedBalances = await getPointsBalancesForHousehold(input.householdId);
  if (!refreshedBalances.error) {
    useAppStore.getState().setPointsBalanceRows(refreshedBalances.data);
  }

  return { ok: true };
}

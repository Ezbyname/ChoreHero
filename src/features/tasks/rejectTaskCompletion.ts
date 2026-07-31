import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { rejectTaskCompletion as rejectTaskCompletionRpc, getTasksForHousehold } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

// Dedicated ERRCODE the RPC raises when the task is not 'needs_attention'
// at the moment of the update — see
// supabase/migrations/20260801000000_approve_reject_task_completion.sql.
// Every other RPC failure collapses to 'failed'; only this one outcome
// gets a specific message, matching the approved scope.
const NOT_PENDING_CODE = 'CH005';

export type RejectTaskCompletionResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_pending' | 'failed' };

interface RejectTaskCompletionInput {
  taskId:      string;
  householdId: string;
  role:        string | null;
}

// Privileged (owner/admin/adult) rejection of a child's completion
// request. EX-07 — see docs/task-state-contract.md §§9,11. Returns the
// task to 'open'; assignee_profile_id is untouched (the task remains the
// same child's to retry) and no completion metadata is set.
export async function rejectTaskCompletion(
  input: RejectTaskCompletionInput,
): Promise<RejectTaskCompletionResult> {
  if (!hasHouseholdPermission(input.role, 'tasks.reject_completion')) {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    const { tasks, setTasks } = useAppStore.getState();
    const task = tasks.find((t) => t.id === input.taskId);
    if (!task || task.status !== 'needs_attention') {
      return { ok: false, reason: 'not_pending' };
    }

    setTasks(
      tasks.map((t) => (t.id === input.taskId ? { ...t, status: 'open' } : t)),
    );
    return { ok: true };
  }

  const rejected = await rejectTaskCompletionRpc(input.taskId);

  if (rejected.error) {
    const reason = rejected.error.code === NOT_PENDING_CODE ? 'not_pending' : 'failed';
    return { ok: false, reason };
  }

  const refreshed = await getTasksForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setTaskRows(refreshed.data);
  return { ok: true };
}

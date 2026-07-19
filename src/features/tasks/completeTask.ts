import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { completeTask as completeTaskRpc, getTasksForHousehold } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

// Dedicated ERRCODE the RPC raises when the task is not 'open' at the
// moment of the update — see supabase/migrations/20260718000000_complete_task.sql.
// Every other RPC failure collapses to 'failed'; only this one outcome
// gets a specific message, matching the approved scope.
const NOT_OPEN_CODE = 'CH002';

export type CompleteTaskResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_open' | 'failed' };

interface CompleteTaskInput {
  taskId:      string;
  householdId: string;
  role:        string | null;
}

// tasks.complete is granted to all four roles including child
// (src/domain/permissions.ts) — the permission alone does not distinguish
// privileged direct completion from a review-required child submission.
// EX-05 only implements privileged (owner/admin/adult) direct completion:
// open -> completed, no review step. A child caller is rejected here with
// the same 'not_authorized' reason used for any other permission failure
// in this codebase — not a new "requires review" outcome. Child-initiated
// completion requests (open -> needs_attention, subject to adult approval)
// are a distinct, review-required flow introduced separately in EX-06
// (see docs/task-state-contract.md §8) — not a variant of this function.
export async function completeTask(input: CompleteTaskInput): Promise<CompleteTaskResult> {
  if (!hasHouseholdPermission(input.role, 'tasks.complete') || input.role === 'child') {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    const { tasks, setTasks } = useAppStore.getState();
    const task = tasks.find((t) => t.id === input.taskId);
    if (!task || task.status !== 'open') {
      return { ok: false, reason: 'not_open' };
    }

    setTasks(tasks.map((t) => (t.id === input.taskId ? { ...t, status: 'completed' } : t)));
    return { ok: true };
  }

  const completed = await completeTaskRpc(input.taskId);

  if (completed.error) {
    const reason = completed.error.code === NOT_OPEN_CODE ? 'not_open' : 'failed';
    return { ok: false, reason };
  }

  const refreshed = await getTasksForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setTaskRows(refreshed.data);
  return { ok: true };
}
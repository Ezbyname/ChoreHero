import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { claimOpenTask as claimOpenTaskRpc, getTasksForHousehold } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

// Dedicated ERRCODE the RPC raises when someone else already claimed the
// task first — see supabase/migrations/20260710000000_claim_open_task.sql.
// Every other RPC failure collapses to 'failed'; only this one outcome
// gets a specific message, matching the approved scope.
const ALREADY_CLAIMED_CODE = 'CH001';

export type ClaimOpenTaskResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'already_claimed' | 'failed' };

interface ClaimOpenTaskInput {
  taskId:      string;
  householdId: string;
  // Used only by the mock-data branch below. The real RPC path ignores
  // this entirely and always assigns to the authenticated caller
  // (auth.uid()) — there is no way to claim a task on someone else's behalf.
  profileId:   string;
  role:        string | null;
}

// Claiming assigns responsibility only: tasks.assignee_profile_id goes
// from null to the caller's own id. It does not complete the task, award
// points, or create a ContributionClaim.
export async function claimOpenTask(input: ClaimOpenTaskInput): Promise<ClaimOpenTaskResult> {
  if (!hasHouseholdPermission(input.role, 'tasks.claim_open')) {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    const { tasks, setTasks } = useAppStore.getState();
    const task = tasks.find((t) => t.id === input.taskId);
    if (!task || task.assigneeId || task.status === 'completed') {
      return { ok: false, reason: 'already_claimed' };
    }

    setTasks(tasks.map((t) => (t.id === input.taskId ? { ...t, assigneeId: input.profileId } : t)));
    return { ok: true };
  }

  const claimed = await claimOpenTaskRpc(input.taskId);

  if (claimed.error) {
    const reason = claimed.error.code === ALREADY_CLAIMED_CODE ? 'already_claimed' : 'failed';

    // Refresh even on already_claimed so the UI drops the stale claim
    // affordance for a task someone else just took.
    if (reason === 'already_claimed') {
      const refreshed = await getTasksForHousehold(input.householdId);
      if (!refreshed.error) useAppStore.getState().setTaskRows(refreshed.data);
    }

    return { ok: false, reason };
  }

  const refreshed = await getTasksForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setTaskRows(refreshed.data);
  return { ok: true };
}

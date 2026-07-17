import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { getTasksForHousehold, insertTask } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

export type CreateTaskResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'invalid_input' | 'failed' };

interface CreateTaskInput {
  householdId:         string;
  title:                string;
  createdByProfileId:   string;
  // undefined/null => Open Task (matches the assignee picker's "Open to
  // anyone" option and the existing FamilyActivity 'claim' action).
  assigneeProfileId?:   string | null;
  points?:              number;
  role:                 string | null;
}

// tasks.assign is only checked when an assignee is actually chosen — an
// adult with only tasks.create (not tasks.assign) can still create an
// Open Task for the household to claim. Both permissions are granted
// together today (adult+), but the RLS-mirrored check stays split so it
// keeps meaning something if that ever changes.
export async function createTask(input: CreateTaskInput): Promise<CreateTaskResult> {
  if (!hasHouseholdPermission(input.role, 'tasks.create')) {
    return { ok: false, reason: 'not_authorized' };
  }
  if (input.assigneeProfileId && !hasHouseholdPermission(input.role, 'tasks.assign')) {
    return { ok: false, reason: 'not_authorized' };
  }

  const title = input.title.trim();
  if (!title) return { ok: false, reason: 'invalid_input' };

  if (!isSupabaseConfigured) {
    const { tasks, setTasks } = useAppStore.getState();
    setTasks([
      {
        id:          `task-${Date.now()}`,
        title,
        householdId: input.householdId,
        createdById: input.createdByProfileId,
        assigneeId:  input.assigneeProfileId ?? undefined,
        status:      'open',
        points:      input.points ?? 0,
      },
      ...tasks,
    ]);
    return { ok: true };
  }

  const inserted = await insertTask({
    householdId:        input.householdId,
    title,
    createdByProfileId: input.createdByProfileId,
    assigneeProfileId:  input.assigneeProfileId ?? null,
    points:              input.points,
  });
  if (inserted.error) return { ok: false, reason: 'failed' };

  const refreshed = await getTasksForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setTaskRows(refreshed.data);
  return { ok: true };
}

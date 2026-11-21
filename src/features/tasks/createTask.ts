import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { getTasksForHousehold, insertTask } from '@/lib/repositories';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import type { RefreshReason } from '@/features/sync/refreshScheduler';
import { mapTaskRow, useAppStore } from '@/store/useAppStore';

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
  // P2-D01/P2-D02: length enforcement is UI-layer only (see AssignedByMeScreen
  // .tsx); this function just normalizes empty/whitespace-only to undefined
  // so it persists as NULL, matching the existing title.trim() pattern.
  description?:         string;
  // P2-D03: optional; when present, dueAtHasTime distinguishes date-only
  // from date+time and MUST be supplied by the caller (the picker
  // interaction is the only place that genuinely knows which was chosen —
  // see src/domain/dateFormat.ts's header comment).
  dueAt?:                string;
  dueAtHasTime?:          boolean;
  points?:              number;
  role:                 string | null;
}

// tasks.assign is only checked when an assignee is actually chosen — an
// adult with only tasks.create (not tasks.assign) can still create an
// Open Task for the household to claim. Both permissions are granted
// together today (adult+), but the RLS-mirrored check stays split so it
// keeps meaning something if that ever changes.
// Test seam only; production callers pass no deps.
export interface CreateTaskDeps {
  insertFn?:       typeof insertTask;
  getTasksFn?:     typeof getTasksForHousehold;
  requestRefresh?: (reason: RefreshReason) => unknown;
}

export async function createTask(input: CreateTaskInput, deps: CreateTaskDeps = {}): Promise<CreateTaskResult> {
  if (!hasHouseholdPermission(input.role, 'tasks.create')) {
    return { ok: false, reason: 'not_authorized' };
  }
  if (input.assigneeProfileId && !hasHouseholdPermission(input.role, 'tasks.assign')) {
    return { ok: false, reason: 'not_authorized' };
  }

  const title = input.title.trim();
  if (!title) return { ok: false, reason: 'invalid_input' };

  // P2-D02: empty/whitespace-only normalizes to undefined (-> NULL on
  // persist), the same way an omitted description already does. Not
  // rejected — only P2-D01's length limit is a validation failure, and
  // that's enforced in the UI layer (P2-D09), not here.
  const description = input.description?.trim() || undefined;

  if (!isSupabaseConfigured) {
    const { tasks, setTasks } = useAppStore.getState();
    setTasks([
      {
        id:           `task-${Date.now()}`,
        title,
        description,
        householdId:  input.householdId,
        createdById:  input.createdByProfileId,
        assigneeId:   input.assigneeProfileId ?? undefined,
        dueAt:        input.dueAt,
        dueAtHasTime: input.dueAt ? (input.dueAtHasTime ?? false) : undefined,
        status:       'open',
        points:       input.points ?? 0,
        createdAt:    new Date().toISOString(),
      },
      ...tasks,
    ]);
    return { ok: true };
  }

  const insertFn       = deps.insertFn       ?? insertTask;
  const getTasksFn     = deps.getTasksFn     ?? getTasksForHousehold;
  const requestRefresh = deps.requestRefresh ?? requestHouseholdRefresh;

  const inserted = await insertFn({
    householdId:        input.householdId,
    title,
    description,
    createdByProfileId: input.createdByProfileId,
    assigneeProfileId:  input.assigneeProfileId ?? null,
    dueAt:               input.dueAt ?? null,
    dueAtHasTime:         input.dueAtHasTime ?? null,
    points:              input.points,
  });
  if (inserted.error) return { ok: false, reason: 'failed' };

  // The task EXISTS from here on. A failed follow-up read must never be
  // reported as a failed creation — the adult would tap Create again and
  // get a duplicate task. Show the inserted row now; a background refresh
  // brings the list fully in line.
  const refreshed = await getTasksFn(input.householdId);
  const store = useAppStore.getState();
  if (!refreshed.error) {
    store.setTaskRows(refreshed.data);
  } else {
    store.setTasks([mapTaskRow(inserted.data), ...store.tasks.filter((t) => t.id !== inserted.data.id)]);
    requestRefresh('mutation');
  }
  return { ok: true };
}

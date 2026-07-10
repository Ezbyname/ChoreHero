import { supabase } from '@/lib/supabase';
import type { TaskRow, TaskStatus } from '@/types/supabase';
import { notConfiguredError } from './types';
import type { RepositoryResult, PaginationOptions } from './types';

// select('*'): Supabase typed client resolves column types from string literals.
// A joined string loses its literal type and causes `data` to infer as `never`.
// select('*') is the correct approach when all columns are needed.

export async function getTaskById(
  taskId: string,
): Promise<RepositoryResult<TaskRow | null>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

export async function getTasksForHousehold(
  householdId: string,
  options?: PaginationOptions,
): Promise<RepositoryResult<TaskRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('household_id', householdId);

  if (options?.limit !== undefined && options?.offset !== undefined) {
    query = query.range(options.offset, options.offset + options.limit - 1) as typeof query;
  } else if (options?.limit !== undefined) {
    query = query.limit(options.limit) as typeof query;
  }

  const { data, error } = await query;
  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

export async function getTasksForAssignee(
  profileId: string,
  options?: PaginationOptions,
): Promise<RepositoryResult<TaskRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('assignee_profile_id', profileId);

  if (options?.limit !== undefined && options?.offset !== undefined) {
    query = query.range(options.offset, options.offset + options.limit - 1) as typeof query;
  } else if (options?.limit !== undefined) {
    query = query.limit(options.limit) as typeof query;
  }

  const { data, error } = await query;
  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

// Calls the claim_open_task RPC (SECURITY DEFINER — see
// supabase/migrations/20260710000000_claim_open_task.sql). The RPC derives
// the claimant from auth.uid() itself; this function never sends a target
// profile id. On failure, error.code is 'CH001' specifically when someone
// else already claimed the task first — every other code is a generic
// failure, mapped by the caller (see src/features/tasks/claimOpenTask.ts).
export async function claimOpenTask(
  taskId: string,
): Promise<RepositoryResult<TaskRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.rpc('claim_open_task', { p_task_id: taskId });
  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

export async function getTasksForHouseholdByStatus(
  householdId: string,
  status: TaskStatus,
  options?: PaginationOptions,
): Promise<RepositoryResult<TaskRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('household_id', householdId)
    .eq('status', status);

  if (options?.limit !== undefined && options?.offset !== undefined) {
    query = query.range(options.offset, options.offset + options.limit - 1) as typeof query;
  } else if (options?.limit !== undefined) {
    query = query.limit(options.limit) as typeof query;
  }

  const { data, error } = await query;
  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

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

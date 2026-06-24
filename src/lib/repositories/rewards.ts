import { supabase } from '@/lib/supabase';
import type { RewardRow } from '@/types/supabase';
import { notConfiguredError } from './types';
import type { RepositoryResult, PaginationOptions } from './types';

// select('*'): Supabase typed client resolves column types from string literals.
// A joined string loses its literal type and causes `data` to infer as `never`.
// select('*') is the correct approach when all columns are needed.

export async function getRewardById(
  rewardId: string,
): Promise<RepositoryResult<RewardRow | null>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('id', rewardId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

export async function getRewardsForHousehold(
  householdId: string,
  options?: PaginationOptions,
): Promise<RepositoryResult<RewardRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  let query = supabase
    .from('rewards')
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

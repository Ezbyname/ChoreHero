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

// Creates a reward. RLS (rewards_insert_adult_plus) independently requires
// created_by_profile_id = auth.uid() and adult+ household membership —
// this is a direct table insert through RLS, not a SECURITY DEFINER RPC,
// matching insertTask's own real/mock split for a plain create action.
export async function insertReward(input: {
  householdId:        string;
  title:               string;
  description?:        string;
  requiredPoints:      number;
  createdByProfileId:  string;
}): Promise<RepositoryResult<RewardRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('rewards')
    .insert({
      household_id:           input.householdId,
      title:                   input.title,
      description:             input.description ?? null,
      points_required:         input.requiredPoints,
      created_by_profile_id:   input.createdByProfileId,
    })
    .select('*')
    .single();

  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

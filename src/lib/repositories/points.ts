import { supabase } from '@/lib/supabase';
import type { PointsBalanceRow } from '@/types/supabase';
import { notConfiguredError } from './types';
import type { PaginationOptions, RepositoryResult } from './types';

// Included in T1.4.6 because app hydration (T1.4.7) needs points balances
// for the Today and Rewards screens to render on sign-in.
//
// select('*'): Supabase typed client resolves column types from string literals.
// select('*') is the correct approach when all columns are needed.

export async function getPointsBalancesForHousehold(
  householdId: string,
  options?: Pick<PaginationOptions, 'signal'>,
): Promise<RepositoryResult<PointsBalanceRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  let query = supabase
    .from('points_balances')
    .select('*')
    .eq('household_id', householdId);
  if (options?.signal) query = query.abortSignal(options.signal) as typeof query;

  const { data, error } = await query;

  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

export async function getPointsBalance(
  householdId: string,
  profileId: string,
): Promise<RepositoryResult<PointsBalanceRow | null>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('points_balances')
    .select('*')
    .eq('household_id', householdId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

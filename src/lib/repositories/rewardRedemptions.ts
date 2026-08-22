import { supabase } from '@/lib/supabase';
import type { RewardRedemptionRow } from '@/types/supabase';
import { notConfiguredError } from './types';
import type { RepositoryResult, PaginationOptions } from './types';

// select('*'): Supabase typed client resolves column types from string literals.
// A joined string loses its literal type and causes `data` to infer as `never`.
// select('*') is the correct approach when all columns are needed.

export async function getRewardRedemptionsForHousehold(
  householdId: string,
  options?: PaginationOptions,
): Promise<RepositoryResult<RewardRedemptionRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  let query = supabase
    .from('reward_redemptions')
    .select('*')
    .eq('household_id', householdId)
    .order('requested_at', { ascending: false });

  if (options?.limit !== undefined && options?.offset !== undefined) {
    query = query.range(options.offset, options.offset + options.limit - 1) as typeof query;
  } else if (options?.limit !== undefined) {
    query = query.limit(options.limit) as typeof query;
  }

  const { data, error } = await query;
  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

export async function getRewardRedemptionById(
  redemptionId: string,
): Promise<RepositoryResult<RewardRedemptionRow | null>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('*')
    .eq('id', redemptionId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

// Calls the request_reward_redemption RPC (SECURITY DEFINER — see
// supabase/migrations/20260822010000_reward_redemption_rpcs.sql). Child-only
// (Decision 4) — the RPC derives the caller from auth.uid() itself and
// requires the caller to be an exact 'child' member of the reward's own
// household; this function never sends a target profile id. p_client_request_id
// is the caller's idempotency key (Decision 10) — reusing it for the same
// reward replays the original redemption; reusing it for a different reward
// fails with error.code 'CH010'. On failure, error.code is one of:
// 'CH006' (reward not found), 'CH007' (reward not active), 'CH008'
// (insufficient balance), 'CH010' (idempotency key reused for a different
// reward), 'CH011' (a pending redemption already exists for this reward) —
// every other code is a generic failure, mapped by the caller (see
// src/features/rewards/requestRewardRedemption.ts).
export async function requestRewardRedemption(
  rewardId:        string,
  clientRequestId: string,
): Promise<RepositoryResult<RewardRedemptionRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.rpc('request_reward_redemption', {
    p_reward_id:         rewardId,
    p_client_request_id: clientRequestId,
  });
  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

// Calls the approve_reward_redemption RPC (SECURITY DEFINER — see
// supabase/migrations/20260822010000_reward_redemption_rpcs.sql).
// Privileged (owner/admin/adult) review only — the RPC derives the caller
// from auth.uid() itself; this function never sends a target profile id.
// On failure, error.code is one of: 'CH012' (redemption not found),
// 'CH013' (redemption not pending review), 'CH007' (reward no longer
// active), 'CH009' (insufficient balance at approval — the redemption
// remains PENDING) — every other code is a generic failure, mapped by the
// caller (see src/features/rewards/approveRewardRedemption.ts).
export async function approveRewardRedemption(
  redemptionId: string,
): Promise<RepositoryResult<RewardRedemptionRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.rpc('approve_reward_redemption', {
    p_redemption_id: redemptionId,
  });
  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

// Calls the reject_reward_redemption RPC (SECURITY DEFINER — see
// supabase/migrations/20260822010000_reward_redemption_rpcs.sql).
// Privileged (owner/admin/adult) review only — the RPC derives the caller
// from auth.uid() itself; this function never sends a target profile id.
// On failure, error.code is one of: 'CH012' (redemption not found),
// 'CH013' (redemption not pending review) — every other code is a generic
// failure, mapped by the caller (see
// src/features/rewards/rejectRewardRedemption.ts).
export async function rejectRewardRedemption(
  redemptionId: string,
): Promise<RepositoryResult<RewardRedemptionRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.rpc('reject_reward_redemption', {
    p_redemption_id: redemptionId,
  });
  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

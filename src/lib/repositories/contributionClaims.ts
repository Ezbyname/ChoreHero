import { supabase } from '@/lib/supabase';
import type { ContributionClaimRow, ContributionClaimStatus } from '@/types/supabase';
import { notConfiguredError } from './types';
import type { RepositoryResult, PaginationOptions } from './types';

// select('*'): Supabase typed client resolves column types from string literals.
// A joined string loses its literal type and causes `data` to infer as `never`.
// select('*') is the correct approach when all columns are needed.

export async function getContributionClaimsForHousehold(
  householdId: string,
  options?: PaginationOptions,
): Promise<RepositoryResult<ContributionClaimRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  let query = supabase
    .from('contribution_claims')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });

  if (options?.limit !== undefined && options?.offset !== undefined) {
    query = query.range(options.offset, options.offset + options.limit - 1) as typeof query;
  } else if (options?.limit !== undefined) {
    query = query.limit(options.limit) as typeof query;
  }

  const { data, error } = await query;
  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

export async function getPendingContributionClaimForMember(
  householdId: string,
  claimedByProfileId: string,
): Promise<RepositoryResult<ContributionClaimRow | null>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('contribution_claims')
    .select('*')
    .eq('household_id', householdId)
    .eq('claimed_by_profile_id', claimedByProfileId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

export async function getContributionClaimById(
  claimId: string,
): Promise<RepositoryResult<ContributionClaimRow | null>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('contribution_claims')
    .select('*')
    .eq('id', claimId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

export async function insertContributionClaim(input: {
  householdId:        string;
  title:               string;
  description?:        string;
  points?:             number;
  claimedByProfileId:  string;
}): Promise<RepositoryResult<ContributionClaimRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('contribution_claims')
    .insert({
      household_id:           input.householdId,
      title:                  input.title,
      description:            input.description ?? null,
      points:                 input.points ?? 0,
      claimed_by_profile_id:  input.claimedByProfileId,
    })
    .select()
    .single();

  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

export async function updateContributionClaimStatus(
  claimId: string,
  patch: {
    status:                 Extract<ContributionClaimStatus, 'approved' | 'rejected'>;
    reviewedByProfileId:    string;
  },
): Promise<RepositoryResult<ContributionClaimRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('contribution_claims')
    .update({
      status:                  patch.status,
      reviewed_by_profile_id:  patch.reviewedByProfileId,
      reviewed_at:             new Date().toISOString(),
    })
    .eq('id', claimId)
    .select()
    .single();

  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

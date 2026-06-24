import { supabase } from '@/lib/supabase';
import type { HouseholdRow, HouseholdMemberRow } from '@/types/supabase';
import { notConfiguredError } from './types';
import type { RepositoryResult } from './types';

// Note on select('*'):
// Supabase's typed client resolves column types from string *literals*.
// A joined-string constant loses its literal type, causing `data` to infer
// as `never`. select('*') is the only safe way to get a fully-typed Row
// when all columns are needed. All tables here have no sensitive columns
// that need to be withheld, so select('*') is appropriate for each query.

export async function getHouseholdById(
  householdId: string,
): Promise<RepositoryResult<HouseholdRow | null>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('households')
    .select('*')
    .eq('id', householdId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

// Returns all households where the given profile is a member.
// Two queries; no nested loops — result set is bounded by membership count.
export async function getHouseholdsForProfile(
  profileId: string,
): Promise<RepositoryResult<HouseholdRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  // Step 1: resolve household IDs for this profile
  const { data: memberRows, error: memberError } = await supabase
    .from('household_members')
    .select('*')
    .eq('profile_id', profileId);

  if (memberError) return { data: null, error: memberError };
  if (!memberRows || memberRows.length === 0) return { data: [], error: null };

  const householdIds = memberRows.map((m) => m.household_id);

  // Step 2: fetch those households
  const { data, error } = await supabase
    .from('households')
    .select('*')
    .in('id', householdIds);

  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

export async function getHouseholdMembers(
  householdId: string,
): Promise<RepositoryResult<HouseholdMemberRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('household_members')
    .select('*')
    .eq('household_id', householdId);

  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

export async function getHouseholdMember(
  householdId: string,
  profileId: string,
): Promise<RepositoryResult<HouseholdMemberRow | null>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('household_members')
    .select('*')
    .eq('household_id', householdId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

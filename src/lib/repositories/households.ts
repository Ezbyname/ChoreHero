import { supabase } from '@/lib/supabase';
import type { HouseholdRow, HouseholdMemberRow } from '@/types/supabase';
import { notConfiguredError } from './types';
import type { RepositoryResult } from './types';
import type { PostgrestError } from '@supabase/supabase-js';

// Shaped as PostgrestError so callers handle it uniformly via result.error.
// 'PGRST_NOT_FOUND' is a sentinel code; RLS failure uses 'PGRST_RLS_NOT_FOUND'.
// The screen must never show result.error.message — use copy strings only.
function householdNotFoundError(): PostgrestError {
  return {
    message: 'Household not found.',
    details: '',
    hint:    '',
    code:    'PGRST_NOT_FOUND',
  } as PostgrestError;
}

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

  // Step 1: resolve household IDs for this profile, ordered by join time.
  // Determinism rule: joined_at ASC, id ASC — ensures stable active-household
  // selection when no default_household_id is set on the profile.
  const { data: memberRows, error: memberError } = await supabase
    .from('household_members')
    .select('*')
    .eq('profile_id', profileId)
    .order('joined_at', { ascending: true })
    .order('id',        { ascending: true });

  if (memberError) return { data: null, error: memberError };
  if (!memberRows || memberRows.length === 0) return { data: [], error: null };

  // Preserve join-time order for active-household resolution.
  const householdIds = memberRows.map((m) => m.household_id);

  // Step 2: fetch those households, ordered by created_at ASC, id ASC so the
  // array position is deterministic regardless of DB storage order.
  const { data, error } = await supabase
    .from('households')
    .select('*')
    .in('id', householdIds)
    .order('created_at', { ascending: true })
    .order('id',         { ascending: true });

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

// Creates a new household and registers the creator as the owner member.
//
// Not idempotent: each call inserts a new household row with a new id.
// Duplicate-submit protection lives at the screen level (isSubmitting guard)
// and is the primary safeguard against duplicate households.
//
// Atomicity: two sequential inserts (no client-side transaction API).
// If the member insert fails after the household insert succeeds, an orphaned
// household row may remain. This is acceptable for MVP; atomic creation via
// a server-side RPC can replace this in a future iteration.
//
// Invariants enforced here:
//   - household.created_by_profile_id === ownerProfileId
//   - member.role === 'owner'
//   - no other households or members are created
//
// RLS note: the Step 1 insert's .select('*').single() relies on
// households_select_member allowing created_by_profile_id = auth.uid() (see
// 20260709000000_fix_households_select_on_create.sql) — at this point no
// household_members row exists yet for this household, so a policy keyed
// only on membership would make RETURNING come back empty and .single()
// throw on every call.
export async function createHouseholdWithOwner(input: {
  name:           string;
  ownerProfileId: string;
}): Promise<RepositoryResult<{ household: HouseholdRow; member: HouseholdMemberRow }>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  // Step 1: insert the household row.
  const { data: household, error: householdError } = await supabase
    .from('households')
    .insert({
      name:                  input.name,
      created_by_profile_id: input.ownerProfileId,
    })
    .select('*')
    .single();

  if (householdError) return { data: null, error: householdError };

  // Step 2: register the creator as the owner member.
  // RLS note: this insert's .select('*').single() has the identical shape of
  // issue as Step 1 — household_members_select_member needs
  // profile_id = auth.uid() (see 20260710010000_fix_household_members_select_on_create.sql),
  // because the row being inserted right now isn't visible to the
  // is_household_member self-lookup from this statement's own snapshot.
  const { data: member, error: memberError } = await supabase
    .from('household_members')
    .insert({
      household_id: household.id,
      profile_id:   input.ownerProfileId,
      role:         'owner',
    })
    .select('*')
    .single();

  if (memberError) return { data: null, error: memberError };

  return { data: { household, member }, error: null };
}

// Joins an existing household as a regular member (role: 'adult').
//
// Join identifier: household.id is used as the temporary join code.
// No invite_code or join_code column exists in the schema (T1.4.4).
// This is intentional foundation behavior — a dedicated invite system is
// a follow-up ticket. Copy uses neutral "Household code" to avoid exposing
// the implementation detail in the UI.
//
// Idempotency: checks for an existing membership before inserting.
// If the profile is already a member (any role), the existing row is
// returned as success. This prevents duplicate-key errors and allows
// safe retry without confusing the user.
//
// Role assignment: 'adult' — the lowest normal member role in the schema.
// Roles: owner > admin > adult > child. Joining users are adults by default.
//
// Does not create households, owner memberships, tasks, or rewards.
// Does not write app data into Zustand — caller must use requestAppDataHydrationRetry.
export async function joinHouseholdById(input: {
  householdId: string;
  profileId:   string;
}): Promise<RepositoryResult<HouseholdMemberRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  // Step 1: verify the household exists. Returns controlled error if not found
  // so the screen can show friendly copy rather than a constraint violation.
  const { data: household, error: lookupError } = await supabase
    .from('households')
    .select('id')
    .eq('id', input.householdId)
    .maybeSingle();

  if (lookupError) return { data: null, error: lookupError };
  if (!household)  return { data: null, error: householdNotFoundError() };

  // Step 2: check for existing membership — idempotency guard.
  // If already a member (any role), return existing row as success.
  // Preserves existing role; does not overwrite owner/admin with 'adult'.
  const { data: existing, error: existingError } = await supabase
    .from('household_members')
    .select('*')
    .eq('household_id', input.householdId)
    .eq('profile_id',   input.profileId)
    .maybeSingle();

  if (existingError) return { data: null, error: existingError };
  if (existing)      return { data: existing, error: null };

  // Step 3: insert new membership with role 'adult' (lowest normal member role).
  const { data: member, error: memberError } = await supabase
    .from('household_members')
    .insert({
      household_id: input.householdId,
      profile_id:   input.profileId,
      role:         'adult',
    })
    .select('*')
    .single();

  if (memberError) return { data: null, error: memberError };
  return { data: member, error: null };
}

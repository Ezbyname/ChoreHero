import { supabase } from '@/lib/supabase';
import type { HouseholdInviteRow, HouseholdMemberRole } from '@/types/supabase';
import { notConfiguredError } from './types';
import type { RepositoryResult } from './types';

// select('*'): Supabase typed client resolves column types from string literals.
// A joined string loses its literal type and causes `data` to infer as `never`.
// select('*') is the correct approach when all columns are needed.

// Short, unambiguous alphabet (no 0/O/1/I) — codes are read off a WhatsApp
// message and occasionally retyped by hand.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH   = 8;

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// Creates a new invite. On the rare code collision (unique constraint),
// retries once with a freshly generated code before surfacing the error.
export async function createHouseholdInvite(input: {
  householdId:        string;
  createdByProfileId: string;
  role?:              Extract<HouseholdMemberRole, 'admin' | 'adult' | 'child'>;
}): Promise<RepositoryResult<HouseholdInviteRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from('household_invites')
      .insert({
        household_id:           input.householdId,
        code:                   generateInviteCode(),
        role:                   input.role ?? 'child',
        created_by_profile_id:  input.createdByProfileId,
      })
      .select('*')
      .single();

    if (!error) return { data, error: null };
    if (error.code !== '23505' /* unique_violation */) return { data: null, error };
  }

  return { data: null, error: notConfiguredError() };
}

// Active (not revoked, not expired) invites for a household, most recent first.
export async function getActiveHouseholdInvites(
  householdId: string,
): Promise<RepositoryResult<HouseholdInviteRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('household_invites')
    .select('*')
    .eq('household_id', householdId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

export async function revokeHouseholdInvite(
  inviteId: string,
): Promise<RepositoryResult<HouseholdInviteRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('household_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .select('*')
    .single();

  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

// Redeems an invite code for the currently authenticated caller (including
// an anonymous-auth session). Returns the joined household's id.
//
// All validation (expiry, revocation, code lookup) and the profile +
// membership writes happen inside the redeem_household_invite RPC — see
// supabase/migrations/20260706120000_household_invites.sql. This function
// is a thin wrapper; it must never attempt the equivalent writes directly
// against household_invites/household_members, since RLS denies those to
// a caller who isn't a member yet.
export async function redeemHouseholdInvite(input: {
  code:         string;
  displayName:  string;
  avatarEmoji?: string | null;
}): Promise<RepositoryResult<string>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.rpc('redeem_household_invite', {
    p_code:         input.code,
    p_display_name: input.displayName,
    p_avatar_emoji: input.avatarEmoji ?? null,
  });

  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

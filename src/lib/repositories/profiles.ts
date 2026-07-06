import { supabase } from '@/lib/supabase';
import type { ProfileRow } from '@/types/supabase';
import { notConfiguredError } from './types';
import type { RepositoryResult } from './types';

// profiles.id is the Supabase auth UID (1:1 with auth.users.id).
// There is no separate auth_user_id column, so "get by auth user ID" and
// "get by profile ID" resolve to the same query on the same column.
// A single function is provided; name it clearly at call sites.
//
// select('*'): Supabase typed client resolves column types from string literals.
// A joined string loses its literal type and causes `data` to infer as `never`.
// select('*') is the correct approach when all columns are needed.

export async function getProfileById(
  profileId: string,
): Promise<RepositoryResult<ProfileRow | null>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

// Batch lookup for household member display (name, avatar_url, avatar_emoji).
// Empty input returns an empty array without a network call.
export async function getProfilesByIds(
  profileIds: string[],
): Promise<RepositoryResult<ProfileRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };
  if (profileIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('id', profileIds);

  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

// Ensures a ChoreHero profile exists for the given auth user.
// Semantically "ensure exists", not "create once". Safe to call on retry,
// duplicate submit, or race — upsert on id (= authUserId) means no duplicate
// row is created and no duplicate-key error is surfaced to the caller.
//
// profiles.id must equal authUserId (1:1 with auth.users.id, enforced by RLS).
// No household or household_members row is created here.
export async function ensureProfileExists(input: {
  authUserId:   string;
  displayName:  string;
  avatarUrl?:   string | null;
  avatarEmoji?: string | null;
}): Promise<RepositoryResult<ProfileRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id:           input.authUserId,
        display_name: input.displayName,
        avatar_url:   input.avatarUrl ?? null,
        avatar_emoji: input.avatarEmoji ?? null,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single();

  if (error) return { data: null, error };
  return { data, error: null };
}

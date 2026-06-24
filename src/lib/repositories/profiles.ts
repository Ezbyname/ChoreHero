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

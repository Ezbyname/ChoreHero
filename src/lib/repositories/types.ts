import type { PostgrestError } from '@supabase/supabase-js';

export type RepositoryResult<T> =
  | { data: T;    error: null }
  | { data: null; error: PostgrestError };

export type PaginationOptions = {
  limit?:  number;
  offset?: number;
};

// Returned when the Supabase client is null (env vars not configured).
// Shaped as PostgrestError so all callers handle it uniformly.
export function notConfiguredError(): PostgrestError {
  return {
    message: 'Supabase is not configured.',
    details: '',
    hint:    '',
    code:    'PGRST_NOT_CONFIGURED',
  } as PostgrestError;
}

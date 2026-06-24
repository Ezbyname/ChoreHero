import type { AuthResponse } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Thin wrapper — returns Supabase AuthResponse directly.
 * AuthBootstrap's onAuthStateChange listener handles session propagation.
 * Callers must not manually write auth state to Zustand after calling this.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResponse> {
  if (!supabase) {
    return {
      data:  { user: null, session: null },
      error: new Error('Supabase is not configured.'),
    } as AuthResponse;
  }
  return supabase.auth.signInWithPassword({ email, password });
}

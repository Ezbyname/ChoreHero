import type { AuthResponse } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Auth user !== ChoreHero app user.
//
// Supabase User represents authentication identity only.
// ChoreHero app user/profile will be loaded later from application tables
// such as profiles, household_members, roles, and preferences.
//
// Do not map authUser directly to `user` in AppStore — that mapping belongs
// to a future Supabase DB integration ticket.

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

/**
 * Thin wrapper — returns Supabase AuthResponse directly.
 * Creates a Supabase Auth identity only. No app profile or household is created.
 * If Supabase requires email confirmation, data.session will be null.
 * AuthBootstrap handles any session returned by onAuthStateChange.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<AuthResponse> {
  if (!supabase) {
    return {
      data:  { user: null, session: null },
      error: new Error('Supabase is not configured.'),
    } as AuthResponse;
  }
  return supabase.auth.signUp({ email, password });
}

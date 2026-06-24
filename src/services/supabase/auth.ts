import type { AuthError, AuthResponse } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Auth user !== ChoreHero app user.
//
// Supabase User represents authentication identity only.
// ChoreHero app user/profile will be loaded later from application tables
// such as profiles, household_members, roles, and preferences.
//
// Do not map authUser directly to `user` in AppStore — that mapping belongs
// to a future Supabase DB integration ticket.

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

export async function signOut(): Promise<{ error: AuthError | null }> {
  if (!supabase) {
    return { error: null };
  }
  return supabase.auth.signOut();
}

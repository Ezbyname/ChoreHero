import type { AuthError, AuthResponse } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getPasswordResetRedirectUrl } from '@/lib/passwordResetRedirect';

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

export async function updatePassword(
  password: string,
): Promise<{ error: AuthError | null }> {
  if (!supabase) {
    return { error: new Error('Supabase is not configured.') as AuthError };
  }
  const { error } = await supabase.auth.updateUser({ password });
  return { error };
}

export async function sendPasswordResetEmail(
  email: string,
): Promise<{ error: AuthError | null }> {
  if (!supabase) {
    return { error: null };
  }
  // On Web this resolves to undefined, producing the exact same request as
  // calling resetPasswordForEmail(email) with no options at all — see
  // passwordResetRedirect.ts. On native it's the current build's own
  // registered scheme, so the recovery email can deep-link back into this
  // app instead of a Web-only URL.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordResetRedirectUrl(),
  });
  return { error };
}

export async function resendSignupEmail(
  email: string,
): Promise<{ error: AuthError | null }> {
  if (!supabase) {
    return { error: null };
  }
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  return { error };
}

// Exact codes confirmed against the installed @supabase/auth-js's own
// ErrorCode union (lib/error-codes.d.ts) — not guessed. Distinguishing this
// specific case is safe: rate limiting applies per-IP/per-project, not
// conditioned on whether a given email is registered, so surfacing it does
// not weaken resetPasswordForEmail's own enumeration-safe design (it never
// reveals "no such user" either way).
export function isRateLimitError(error: Pick<AuthError, 'code'> | null | undefined): boolean {
  return error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit';
}

import { updatePassword } from '@/services/supabase/auth';

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_input' | 'failed' };

// Validation is deliberately limited to "non-empty" and "matches
// confirmation" — see this feature's own plan task for why no length/
// strength rule is introduced here. Supabase's own configured policy is
// authoritative for anything beyond that; a rejection on those grounds
// surfaces as reason: 'failed', the same as any other provider error —
// this function does not distinguish "too weak" from "expired session"
// from any other provider-side failure, matching the existing
// normalized-error convention used by every other auth screen in this repo.
export async function resetPassword(
  password: string,
  confirmPassword: string,
): Promise<ResetPasswordResult> {
  if (!password || !confirmPassword || password !== confirmPassword) {
    return { ok: false, reason: 'invalid_input' };
  }

  const { error } = await updatePassword(password);
  if (error) {
    return { ok: false, reason: 'failed' };
  }

  return { ok: true };
}

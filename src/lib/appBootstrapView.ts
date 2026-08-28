import type { AuthRedirectResult } from '@/lib/authRedirectDetection';

export type ExpiredRecoveryMode = 'expired' | 'requestReset';

export type AppBootstrapView =
  | { view: 'loading' }
  | { view: 'resetPassword' }
  | { view: 'recoveryExpired' }
  | { view: 'requestNewLink' }
  | { view: 'emailConfirmed' }
  | { view: 'normalBoot' };

// Pure decision extracted out of AppBootstrap.tsx specifically so the N1.3
// corrective-patch fix is provably testable, not just asserted: this
// signature has no session/auth-state parameter at all, so "does the
// expired-link CTA depend on whether a session happens to exist" is
// structurally impossible here, not just something reasoned about after
// the fact. AppBootstrap.tsx owns all the platform/async/session wiring;
// this only owns "given the current classification, which view is it."
export function resolveAppBootstrapView(
  isResolvingNativeRecovery: boolean,
  redirectResult: AuthRedirectResult,
  expiredRecoveryMode: ExpiredRecoveryMode,
): AppBootstrapView {
  if (isResolvingNativeRecovery) {
    return { view: 'loading' };
  }

  if (redirectResult.type === 'recovery') {
    return { view: 'resetPassword' };
  }

  if (redirectResult.type === 'error') {
    // The bug this fixes: "Request a new link" must always mean requesting
    // a new link — this branch never looks at auth/session state, and
    // never can, by construction.
    return expiredRecoveryMode === 'requestReset' ? { view: 'requestNewLink' } : { view: 'recoveryExpired' };
  }

  if (redirectResult.type === 'other') {
    return { view: 'emailConfirmed' };
  }

  return { view: 'normalBoot' };
}

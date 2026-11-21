// Pure state for the child "Did you do something helpful?" form on Today.
// No React, no react-native — Node-test safe. TodayScreen's
// ClaimContributionForm renders deriveClaimFormView()'s result.
//
// Feedback rules:
//   - success is shown only after claimContribution() resolved ok (the row
//     is inserted AND the store refreshed) — never optimistically;
//   - a failure never shows success, and keeps the typed text for retry;
//   - once the member has a pending claim in the store, the form shows that
//     "waiting for approval" state instead of the input. The backend allows
//     one pending claim per member (uq_contribution_claims_one_pending_per_member),
//     and the store row survives re-renders/remounts, so the confirmation
//     cannot be erased by a refresh the way a local message could.

import type { ClaimContributionResult } from '@/features/contributions/claimContribution';

export type ClaimFormPhase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'sent';   title: string }
  | { kind: 'failed'; reason: 'duplicate_pending' | 'failed' };

export const INITIAL_CLAIM_FORM_PHASE: ClaimFormPhase = { kind: 'idle' };

export function canSubmitClaim(phase: ClaimFormPhase, title: string): boolean {
  return phase.kind !== 'submitting' && phase.kind !== 'sent' && title.trim().length > 0;
}

export function onClaimSubmitStarted(): ClaimFormPhase {
  return { kind: 'submitting' };
}

export function onClaimSubmitResult(result: ClaimContributionResult, title: string): ClaimFormPhase {
  if (result.ok) return { kind: 'sent', title: title.trim() };
  return { kind: 'failed', reason: result.reason === 'duplicate_pending' ? 'duplicate_pending' : 'failed' };
}

// claimContribution() is not supposed to throw, but a thrown network/runtime
// error must still land in a visible, retryable failure — never a spinner
// stuck forever and never success.
export function onClaimSubmitThrew(): ClaimFormPhase {
  return { kind: 'failed', reason: 'failed' };
}

// Editing the text after a failure clears the stale error.
export function onClaimTitleEdited(phase: ClaimFormPhase): ClaimFormPhase {
  return phase.kind === 'failed' ? INITIAL_CLAIM_FORM_PHASE : phase;
}

export type ClaimFormView =
  | { kind: 'form';    submitting: boolean; error: 'duplicate_pending' | 'failed' | null }
  | { kind: 'sent';    title: string }
  | { kind: 'waiting'; title: string };

export function deriveClaimFormView(
  phase:            ClaimFormPhase,
  myPendingTitle:   string | null,
): ClaimFormView {
  // Just sent in this session: the explicit "Sent!" confirmation wins.
  if (phase.kind === 'sent') return { kind: 'sent', title: phase.title };
  // Any other time a pending claim exists (app reopen, remount, or a
  // duplicate_pending bounce): show it as waiting rather than an input
  // that the backend would refuse anyway.
  if (myPendingTitle !== null && phase.kind !== 'submitting') {
    return { kind: 'waiting', title: myPendingTitle };
  }
  return {
    kind:       'form',
    submitting: phase.kind === 'submitting',
    error:      phase.kind === 'failed' ? phase.reason : null,
  };
}

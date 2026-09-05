// Adult Reward Review Confirmation — pure orchestration logic, extracted so
// it is directly unit-testable without a component-render harness (this
// repo has none, and none is being introduced for this slice). Mirrors
// rewardRequestUx.ts's own precedent and rationale exactly.
//
// UI-only outcome vocabulary. CANCELLED here means the reviewer backed out
// of the confirmation before any mutation was attempted — it is NOT the
// existing RewardRedemption.status = 'cancelled' value, which represents a
// different Product event entirely (the child withdrawing their own
// request). This module never reads or writes that status; it only
// decides whether/which of the two existing approve/reject mutations to
// call, and maps the result to a UI outcome.

export type ReviewAction = 'approve' | 'reject';

export type ReviewMutationResult =
  | { ok: true }
  | { ok: false; reason: string };

export type ReviewOutcome =
  | { kind: 'APPROVED' }
  | { kind: 'REJECTED' }
  | { kind: 'CANCELLED' }
  | { kind: 'FAILED'; reason: string };

export interface ReviewMutations {
  approve: () => Promise<ReviewMutationResult>;
  reject:  () => Promise<ReviewMutationResult>;
}

// Not confirmed -> CANCELLED, neither mutation is ever called. Confirmed
// -> calls exactly the mutation matching `action` (never the other one)
// and maps its result to APPROVED/REJECTED on success or FAILED on
// failure. A confirmed-but-failed mutation is FAILED, never CANCELLED.
export async function resolveReviewConfirmation(
  action:     ReviewAction,
  confirmed:  boolean,
  mutations:  ReviewMutations,
): Promise<ReviewOutcome> {
  if (!confirmed) return { kind: 'CANCELLED' };

  const result = action === 'approve' ? await mutations.approve() : await mutations.reject();

  if (!result.ok) return { kind: 'FAILED', reason: result.reason };
  return action === 'approve' ? { kind: 'APPROVED' } : { kind: 'REJECTED' };
}

// Guards a rapid double-tap on the confirm button from invoking the
// underlying mutation twice for the same pending review: a second call
// made while the first is still in flight returns the SAME promise
// instead of starting a second mutation attempt, so both calls resolve to
// one identical outcome and the mutation itself is invoked exactly once.
// One guard is meant to be created per review section (matching the
// existing pendingActivityId convention, which already only allows one
// review action in flight at a time) — not per redemption row.
export function createConfirmGuard() {
  let inFlight: Promise<ReviewOutcome> | null = null;

  return function guardedConfirm(
    action:    ReviewAction,
    mutations: ReviewMutations,
  ): Promise<ReviewOutcome> {
    if (inFlight) return inFlight;

    const promise = resolveReviewConfirmation(action, true, mutations).finally(() => {
      inFlight = null;
    });
    inFlight = promise;
    return promise;
  };
}

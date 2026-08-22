// Pure decision logic backing RewardCard's request flow — extracted so it
// is directly unit-testable without a component-render harness (this repo
// has none, and none is being introduced for this slice). RewardCard wires
// these functions to a React ref/state; the functions themselves hold no
// React dependency.

// ── Request availability (presentation-level guard only) ─────────────────────
//
// UX guards only — the backend RPC (request_reward_redemption) remains the
// authoritative boundary regardless of what this function returns.
export function isRedemptionRequestAvailable(input: {
  canRequestPermission: boolean; // selectCanRequestRedemption — already an exact child-role gate
  rewardIsActive:       boolean;
  viewerBalance:        number;
  requiredPoints:       number;
  hasPendingRedemption: boolean; // this viewer's own PENDING redemption for this reward
  isSubmitting:         boolean;
}): boolean {
  return (
    input.canRequestPermission &&
    input.rewardIsActive &&
    input.viewerBalance >= input.requiredPoints &&
    !input.hasPendingRedemption &&
    !input.isSubmitting
  );
}

// ── client_request_id lifecycle (Decision 10, client side) ───────────────────
//
// One intentional redemption request = one UUID. See RewardCard.tsx's own
// comment block for the full rationale; these two functions are the pure
// core of that lifecycle:
//
//   resolveClientRequestId — which id to use for this attempt (reuse the
//   in-flight cycle's id, or mint a fresh one for a new cycle).
//
//   nextClientRequestId — given the outcome of that attempt, what the ref
//   should hold afterward (keep, for a same-key retry; or clear, so the
//   next eligible press starts a genuinely new cycle).

// existingId: the ref's current value (null = no cycle in flight).
// generateId: only called when existingId is null — never regenerates an
// id for an already-in-flight cycle merely because this was called again.
export function resolveClientRequestId(
  existingId: string | null,
  generateId: () => string,
): string {
  return existingId ?? generateId();
}

export type RequestOutcome =
  | { ok: true }
  | { ok: false; reason: string };

// 'failed' is the one outcome this feature treats as retryable with the
// same key — a generic/transient failure where nothing about the request
// itself was wrong. Every other outcome (success, or a specific/terminal
// failure such as reward_archived, insufficient_balance,
// idempotency_conflict, duplicate_pending, not_authorized,
// reward_not_found) ends the current cycle: success because the
// redemption is now pending and no further presses are possible until it
// resolves; a specific failure because reusing the same key could not
// possibly produce a different result next time.
export function nextClientRequestId(
  currentId: string,
  outcome:   RequestOutcome,
): string | null {
  if (!outcome.ok && outcome.reason === 'failed') return currentId;
  return null;
}

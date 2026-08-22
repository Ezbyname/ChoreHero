import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRedemptionRequestAvailable,
  resolveClientRequestId,
  nextClientRequestId,
} from '@/features/rewards/rewardRequestUx';

function baseAvailability() {
  return {
    canRequestPermission: true,
    rewardIsActive:       true,
    viewerBalance:        100,
    requiredPoints:       50,
    hasPendingRedemption: false,
    isSubmitting:         false,
  };
}

// ── isRedemptionRequestAvailable ──────────────────────────────────────────────

test('request is available when every condition is satisfied', () => {
  assert.equal(isRedemptionRequestAvailable(baseAvailability()), true);
});

// Mirrors selectCanRequestRedemption's own exact-role behavior — this
// function does not re-derive role, it trusts the already-exact
// canRequestPermission input, but must still respect it being false.
test('request is unavailable when the permission gate is false (e.g. an adult/admin/owner viewer)', () => {
  assert.equal(
    isRedemptionRequestAvailable({ ...baseAvailability(), canRequestPermission: false }),
    false,
  );
});

test('request is unavailable for an archived reward', () => {
  assert.equal(
    isRedemptionRequestAvailable({ ...baseAvailability(), rewardIsActive: false }),
    false,
  );
});

test('request is unavailable with insufficient balance', () => {
  assert.equal(
    isRedemptionRequestAvailable({ ...baseAvailability(), viewerBalance: 10 }),
    false,
  );
});

// Exactly-equal balance is sufficient (>=, not >).
test('request is available when balance exactly equals the required points', () => {
  assert.equal(
    isRedemptionRequestAvailable({ ...baseAvailability(), viewerBalance: 50, requiredPoints: 50 }),
    true,
  );
});

test('request is unavailable while a redemption for this reward is already pending', () => {
  assert.equal(
    isRedemptionRequestAvailable({ ...baseAvailability(), hasPendingRedemption: true }),
    false,
  );
});

// Decision 3: a prior APPROVED or REJECTED cycle is not "pending" — the
// caller is responsible for only ever passing hasPendingRedemption=true
// for an actual PENDING row (see RewardsScreen's myPendingByRewardId,
// which is built by filtering status === 'pending' only). This test
// documents that this function itself has no special-casing for terminal
// status — the caller's exclusion of terminal rows is what makes a new
// cycle available again, not logic inside this function.
test('request is available again once no pending redemption is passed, regardless of any prior terminal cycle', () => {
  assert.equal(
    isRedemptionRequestAvailable({ ...baseAvailability(), hasPendingRedemption: false }),
    true,
  );
});

test('request is unavailable while a submission is already in flight (double-press guard)', () => {
  assert.equal(
    isRedemptionRequestAvailable({ ...baseAvailability(), isSubmitting: true }),
    false,
  );
});

// ── resolveClientRequestId ────────────────────────────────────────────────────

test('resolveClientRequestId mints a new id when no cycle is in flight', () => {
  let calls = 0;
  const id = resolveClientRequestId(null, () => {
    calls += 1;
    return 'generated-id';
  });
  assert.equal(id, 'generated-id');
  assert.equal(calls, 1);
});

// This is the core Decision-10 client-side guarantee: a retry of the same
// logical action must never mint a second UUID.
test('resolveClientRequestId reuses the existing id and never calls the generator when a cycle is already in flight', () => {
  let calls = 0;
  const id = resolveClientRequestId('existing-id', () => {
    calls += 1;
    return 'should-not-be-used';
  });
  assert.equal(id, 'existing-id');
  assert.equal(calls, 0);
});

// ── nextClientRequestId ────────────────────────────────────────────────────────

test('nextClientRequestId clears the id on success (the cycle is complete)', () => {
  assert.equal(nextClientRequestId('id-1', { ok: true }), null);
});

// The one outcome retrying is meant to recover from.
test('nextClientRequestId keeps the id on a generic failure, for a same-key retry', () => {
  assert.equal(nextClientRequestId('id-1', { ok: false, reason: 'failed' }), 'id-1');
});

for (const reason of [
  'not_authorized',
  'reward_not_found',
  'reward_archived',
  'insufficient_balance',
  'duplicate_pending',
  'idempotency_conflict',
]) {
  test(`nextClientRequestId clears the id on a specific/terminal failure (${reason}), so the next cycle mints fresh`, () => {
    assert.equal(nextClientRequestId('id-1', { ok: false, reason }), null);
  });
}

import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { cancelRewardRedemption } from '@/features/rewards/cancelRewardRedemption';
import { useAppStore } from '@/store/useAppStore';
import type { RewardRedemption } from '@/types';

const HOUSEHOLD_ID = 'house-1';
const CHILD_ID      = 'child-1';
const OTHER_CHILD_ID = 'child-2';
const ADULT_ID      = 'adult-1';

function seedRedemption(overrides: Partial<RewardRedemption> = {}): void {
  useAppStore.getState().setRewardRedemptions([
    {
      id:                     'redemption-1',
      householdId:            HOUSEHOLD_ID,
      rewardId:               'reward-1',
      requestedByProfileId:   CHILD_ID,
      clientRequestId:        'key-1',
      pointsRequiredSnapshot: 50,
      status:                 'pending',
      reservationModel:       'reserved',
      requestedAt:            new Date().toISOString(),
      createdAt:              new Date().toISOString(),
      updatedAt:              new Date().toISOString(),
      ...overrides,
    },
  ]);
}

afterEach(() => {
  useAppStore.getState().resetAppState();
});

test('missing rewards.cancel_redemption permission returns not_authorized without touching the store', async () => {
  seedRedemption();

  const result = await cancelRewardRedemption({
    redemptionId:         'redemption-1',
    householdId:          HOUSEHOLD_ID,
    role:                 null,
    requestedByProfileId: CHILD_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
  assert.equal(useAppStore.getState().rewardRedemptions[0]?.status, 'pending');
});

// Ownership-based, not privilege-based: an adult holds no
// rewards.cancel_redemption permission at all (it is child-only), so an
// adult attempting to cancel anyone's redemption — including a child's —
// is rejected at the client gate before ownership is even considered.
test('adult role is not authorized to cancel a redemption', async () => {
  seedRedemption();

  const result = await cancelRewardRedemption({
    redemptionId:         'redemption-1',
    householdId:          HOUSEHOLD_ID,
    role:                 'adult',
    requestedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('unknown redemption returns not_found', async () => {
  const result = await cancelRewardRedemption({
    redemptionId:         'no-such-redemption',
    householdId:          HOUSEHOLD_ID,
    role:                 'child',
    requestedByProfileId: CHILD_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_found' });
});

// A child holding rewards.cancel_redemption may still only cancel their
// OWN redemption — this is ownership, not merely the permission string.
test('a child cannot cancel another child\'s pending redemption', async () => {
  seedRedemption({ requestedByProfileId: CHILD_ID });

  const result = await cancelRewardRedemption({
    redemptionId:         'redemption-1',
    householdId:          HOUSEHOLD_ID,
    role:                 'child',
    requestedByProfileId: OTHER_CHILD_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_own_redemption' });
  assert.equal(useAppStore.getState().rewardRedemptions[0]?.status, 'pending');
});

test('child can cancel their own pending redemption with no balance mutation', async () => {
  useAppStore.getState().setPointsBalances([{ userId: CHILD_ID, householdId: HOUSEHOLD_ID, balance: 100 }]);
  seedRedemption();

  const result = await cancelRewardRedemption({
    redemptionId:         'redemption-1',
    householdId:          HOUSEHOLD_ID,
    role:                 'child',
    requestedByProfileId: CHILD_ID,
  });

  assert.deepEqual(result, { ok: true });

  const redemption = useAppStore.getState().rewardRedemptions.find((r) => r.id === 'redemption-1');
  assert.equal(redemption?.status, 'cancelled');
  // No reviewer fields set — cancellation is a self-service withdrawal,
  // never a review decision.
  assert.equal(redemption?.reviewedByProfileId, undefined);
  assert.equal(redemption?.reviewedAt, undefined);

  // No balance mutation — reservation release is purely a status
  // transition; the child's gross balance never moves for a cancel.
  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === CHILD_ID);
  assert.equal(balance?.balance, 100);
});

// Terminal-state CAS: an already-cancelled redemption cannot be cancelled
// again.
test('cancelling an already-cancelled redemption returns not_pending', async () => {
  seedRedemption({ status: 'cancelled' });

  const result = await cancelRewardRedemption({
    redemptionId:         'redemption-1',
    householdId:          HOUSEHOLD_ID,
    role:                 'child',
    requestedByProfileId: CHILD_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

// Approve-vs-cancel race outcome: once an adult has approved, the child
// can no longer withdraw it.
test('cancelling an already-approved redemption returns not_pending', async () => {
  seedRedemption({ status: 'approved', reviewedByProfileId: ADULT_ID, reviewedAt: new Date().toISOString() });

  const result = await cancelRewardRedemption({
    redemptionId:         'redemption-1',
    householdId:          HOUSEHOLD_ID,
    role:                 'child',
    requestedByProfileId: CHILD_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

// Reject-vs-cancel race outcome: once an adult has rejected, the child's
// own cancel attempt is likewise a no-op, not a fresh transition.
test('cancelling an already-rejected redemption returns not_pending', async () => {
  seedRedemption({ status: 'rejected', reviewedByProfileId: ADULT_ID, reviewedAt: new Date().toISOString() });

  const result = await cancelRewardRedemption({
    redemptionId:         'redemption-1',
    householdId:          HOUSEHOLD_ID,
    role:                 'child',
    requestedByProfileId: CHILD_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

// Cancellation must remain available even with no corresponding reward
// present in the store at all — mirrors reject's own archived-reward
// availability (Decision 7): unlike request, cancel never looks up or
// depends on the reward's isActive state, only the redemption's own
// ownership and pending status.
test('cancellation does not depend on the reward\'s active state', async () => {
  useAppStore.getState().setRewards([]);
  seedRedemption();

  const result = await cancelRewardRedemption({
    redemptionId:         'redemption-1',
    householdId:          HOUSEHOLD_ID,
    role:                 'child',
    requestedByProfileId: CHILD_ID,
  });

  assert.deepEqual(result, { ok: true });
});

// Legacy Pending compatibility (Final Pre-Commit Closure Gate): cancel
// never mutates balance for ANY redemption, regardless of reservation
// model. A legacy row was never reserved in the first place, so
// cancelling one carries no phantom-credit risk — cancellation is
// inherently safe here purely because it never touches balance at all.
test('cancelling a legacy-model pending redemption does no balance mutation (no phantom credit)', async () => {
  useAppStore.getState().setPointsBalances([{ userId: CHILD_ID, householdId: HOUSEHOLD_ID, balance: 100 }]);
  seedRedemption({ reservationModel: 'legacy' });

  const result = await cancelRewardRedemption({
    redemptionId:         'redemption-1',
    householdId:          HOUSEHOLD_ID,
    role:                 'child',
    requestedByProfileId: CHILD_ID,
  });

  assert.deepEqual(result, { ok: true });
  const redemption = useAppStore.getState().rewardRedemptions.find((r) => r.id === 'redemption-1');
  assert.equal(redemption?.status, 'cancelled');
  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === CHILD_ID);
  assert.equal(balance?.balance, 100);
});

import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { rejectRewardRedemption } from '@/features/rewards/rejectRewardRedemption';
import { useAppStore } from '@/store/useAppStore';
import type { RewardRedemption } from '@/types';

const HOUSEHOLD_ID = 'house-1';
const CHILD_ID      = 'child-1';
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

test('missing rewards.reject_redemption permission returns not_authorized without touching the store', async () => {
  seedRedemption();

  const result = await rejectRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                null,
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
  assert.equal(useAppStore.getState().rewardRedemptions[0]?.status, 'pending');
});

test('child role is not authorized to reject a redemption', async () => {
  seedRedemption();

  const result = await rejectRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'child',
    reviewedByProfileId: CHILD_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('unknown redemption returns not_found', async () => {
  const result = await rejectRewardRedemption({
    redemptionId:        'no-such-redemption',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_found' });
});

test('adult can reject a pending redemption with no balance mutation', async () => {
  useAppStore.getState().setPointsBalances([{ userId: CHILD_ID, householdId: HOUSEHOLD_ID, balance: 100 }]);
  seedRedemption();

  const result = await rejectRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: true });

  const redemption = useAppStore.getState().rewardRedemptions.find((r) => r.id === 'redemption-1');
  assert.equal(redemption?.status, 'rejected');
  assert.equal(redemption?.reviewedByProfileId, ADULT_ID);
  assert.ok(redemption?.reviewedAt);

  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === CHILD_ID);
  assert.equal(balance?.balance, 100);
});

// Terminal-state CAS: an already-rejected (or already-approved) redemption
// cannot be rejected again — covers the approve-vs-reject race outcome too.
test('rejecting an already-approved redemption returns not_pending', async () => {
  seedRedemption({ status: 'approved', reviewedByProfileId: ADULT_ID, reviewedAt: new Date().toISOString() });

  const result = await rejectRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

// Legacy Pending compatibility (Final Pre-Commit Closure Gate): rejection
// never mutates balance for ANY redemption, regardless of reservation
// model — a legacy row was never reserved, so there is no "phantom
// release" risk here; this proves rejecting one behaves identically to
// rejecting a new-model row.
test('rejecting a legacy-model pending redemption does no balance mutation, same as a new-model one', async () => {
  useAppStore.getState().setPointsBalances([{ userId: CHILD_ID, householdId: HOUSEHOLD_ID, balance: 100 }]);
  seedRedemption({ reservationModel: 'legacy' });

  const result = await rejectRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: true });
  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === CHILD_ID);
  assert.equal(balance?.balance, 100);
});

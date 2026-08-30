import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { approveRewardRedemption } from '@/features/rewards/approveRewardRedemption';
import { useAppStore } from '@/store/useAppStore';
import type { PointsBalance, Reward, RewardRedemption } from '@/types';

const HOUSEHOLD_ID = 'house-1';
const CHILD_ID      = 'child-1';
const ADULT_ID      = 'adult-1';

function seedReward(overrides: Partial<Reward> = {}): void {
  useAppStore.getState().setRewards([
    {
      id:             'reward-1',
      householdId:    HOUSEHOLD_ID,
      title:          'Movie Night',
      requiredPoints: 50,
      isActive:       true,
      ...overrides,
    },
  ]);
}

function seedBalance(balance: number): void {
  useAppStore.getState().setPointsBalances([
    { userId: CHILD_ID, householdId: HOUSEHOLD_ID, balance },
  ]);
}

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

test('missing rewards.approve_redemption permission returns not_authorized without touching the store', async () => {
  seedReward();
  seedBalance(100);
  seedRedemption();

  const result = await approveRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                null,
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
  assert.equal(useAppStore.getState().rewardRedemptions[0]?.status, 'pending');
});

// child does not hold rewards.approve_redemption (adult+ only) — Decision 2.
test('child role is not authorized to approve a redemption', async () => {
  seedReward();
  seedBalance(100);
  seedRedemption();

  const result = await approveRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'child',
    reviewedByProfileId: CHILD_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('unknown redemption returns not_found', async () => {
  const result = await approveRewardRedemption({
    redemptionId:        'no-such-redemption',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_found' });
});

test('adult can approve a pending redemption, deducting the balance and awarding one transition', async () => {
  seedReward();
  seedBalance(100);
  seedRedemption();

  const result = await approveRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: true });

  const redemption = useAppStore.getState().rewardRedemptions.find((r) => r.id === 'redemption-1');
  assert.equal(redemption?.status, 'approved');
  assert.equal(redemption?.reviewedByProfileId, ADULT_ID);
  assert.ok(redemption?.reviewedAt);

  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === CHILD_ID);
  assert.equal(balance?.balance, 50);
});

// Terminal-state CAS: an already-approved (or already-rejected) redemption
// cannot be approved again.
test('approving an already-approved redemption returns not_pending', async () => {
  seedReward();
  seedBalance(100);
  seedRedemption({ status: 'approved', reviewedByProfileId: ADULT_ID, reviewedAt: new Date().toISOString() });

  const result = await approveRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

test('archived reward blocks approval, leaving the redemption pending', async () => {
  seedReward({ isActive: false });
  seedBalance(100);
  seedRedemption();

  const result = await approveRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'reward_archived' });
  assert.equal(useAppStore.getState().rewardRedemptions[0]?.status, 'pending');
});

// Decision 5: insufficient balance at approval fails cleanly and the
// redemption remains PENDING (not silently deducted to negative, not
// force-approved).
test('insufficient balance at approval returns insufficient_balance and leaves the redemption pending', async () => {
  seedReward();
  seedBalance(10); // request-time balance may have since dropped below the snapshot
  seedRedemption();

  const result = await approveRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: false, reason: 'insufficient_balance' });
  const redemption = useAppStore.getState().rewardRedemptions.find((r) => r.id === 'redemption-1');
  assert.equal(redemption?.status, 'pending');
  assert.equal(redemption?.reviewedByProfileId, undefined);
  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === CHILD_ID);
  assert.equal(balance?.balance, 10);
});

test('uses the request-time points_required_snapshot, not the reward\'s current price', async () => {
  seedReward({ requiredPoints: 999 }); // price changed after the request
  seedBalance(100);
  seedRedemption({ pointsRequiredSnapshot: 50 });

  const result = await approveRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: true });
  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === CHILD_ID);
  assert.equal(balance?.balance, 50); // 100 - 50 snapshot, not 100 - 999
});

// Legacy Pending compatibility (Final Pre-Commit Closure Gate): approval
// never reads reservationModel — it always deducts points_required_snapshot
// directly from gross balance exactly once, regardless of which model
// produced the row. A legacy row's approval must behave identically to a
// new-model row's approval.
test('a legacy-model pending redemption approves with the same single, exact deduction as a new-model one', async () => {
  seedReward();
  seedBalance(100);
  seedRedemption({ pointsRequiredSnapshot: 50, reservationModel: 'legacy' });

  const result = await approveRewardRedemption({
    redemptionId:        'redemption-1',
    householdId:         HOUSEHOLD_ID,
    role:                'adult',
    reviewedByProfileId: ADULT_ID,
  });

  assert.deepEqual(result, { ok: true });
  const redemption = useAppStore.getState().rewardRedemptions.find((r) => r.id === 'redemption-1');
  assert.equal(redemption?.status, 'approved');
  const balance = useAppStore.getState().pointsBalances.find((pb) => pb.userId === CHILD_ID);
  assert.equal(balance?.balance, 50); // 100 - 50, exactly once — no double-deduction risk
});

import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { requestRewardRedemption } from '@/features/rewards/requestRewardRedemption';
import { useAppStore } from '@/store/useAppStore';
import type { PointsBalance, Reward } from '@/types';

const HOUSEHOLD_ID = 'house-1';
const CHILD_ID      = 'child-1';

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

function seedBalance(balance: number, overrides: Partial<PointsBalance> = {}): void {
  useAppStore.getState().setPointsBalances([
    { userId: CHILD_ID, householdId: HOUSEHOLD_ID, balance, ...overrides },
  ]);
}

afterEach(() => {
  useAppStore.getState().resetAppState();
});

test('missing rewards.request_redemption permission returns not_authorized without touching the store', async () => {
  seedReward();
  seedBalance(100);

  const result = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 null,
    clientRequestId:      'key-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
  assert.equal(useAppStore.getState().rewardRedemptions.length, 0);
});

// Decision 4: requester = beneficiary = child, always — an adult (which
// also holds rewards.redeem historically, and is adult+ tier) may not
// request a redemption for themselves.
test('adult role is not authorized to request a redemption (Decision 4)', async () => {
  seedReward();
  seedBalance(100);

  const result = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: 'adult-1',
    role:                 'adult',
    clientRequestId:      'key-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('child can request a redemption for an active reward with sufficient balance', async () => {
  seedReward();
  seedBalance(100);

  const result = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.redemption.status, 'pending');
  assert.equal(result.redemption.pointsRequiredSnapshot, 50);
  assert.equal(useAppStore.getState().rewardRedemptions.length, 1);
});

test('unknown reward returns reward_not_found', async () => {
  seedBalance(100);

  const result = await requestRewardRedemption({
    rewardId:             'no-such-reward',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'reward_not_found' });
});

test('archived reward returns reward_archived', async () => {
  seedReward({ isActive: false });
  seedBalance(100);

  const result = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'reward_archived' });
});

// Decision 9: balance must be sufficient at request time.
test('insufficient balance returns insufficient_balance', async () => {
  seedReward();
  seedBalance(10);

  const result = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'insufficient_balance' });
});

// Decision 8: at most one PENDING redemption per (child, reward).
test('a second request for the same reward while one is pending returns duplicate_pending', async () => {
  seedReward();
  seedBalance(100);

  const first = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });
  assert.equal(first.ok, true);

  const second = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-2',
  });

  assert.deepEqual(second, { ok: false, reason: 'duplicate_pending' });
  assert.equal(useAppStore.getState().rewardRedemptions.length, 1);
});

// Decision 10: true idempotency via client_request_id — same key + same
// reward replays the original redemption rather than erroring or
// creating a duplicate.
test('replaying the same client_request_id for the same reward returns the original redemption', async () => {
  seedReward();
  seedBalance(100);

  const first = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const replay = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });

  assert.equal(replay.ok, true);
  if (!replay.ok) return;
  assert.equal(replay.redemption.id, first.redemption.id);
  assert.equal(useAppStore.getState().rewardRedemptions.length, 1);
});

// Same client_request_id reused for a different reward is a genuine
// conflict, not a replay — must not silently succeed against the wrong
// reward.
test('reusing a client_request_id for a different reward returns idempotency_conflict', async () => {
  useAppStore.getState().setRewards([
    { id: 'reward-1', householdId: HOUSEHOLD_ID, title: 'Movie Night', requiredPoints: 50, isActive: true },
    { id: 'reward-2', householdId: HOUSEHOLD_ID, title: 'Sleep In',    requiredPoints: 20, isActive: true },
  ]);
  seedBalance(100);

  const first = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });
  assert.equal(first.ok, true);

  const conflict = await requestRewardRedemption({
    rewardId:             'reward-2',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });

  assert.deepEqual(conflict, { ok: false, reason: 'idempotency_conflict' });
  assert.equal(useAppStore.getState().rewardRedemptions.length, 1);
});

// Decision 3: repeated completed redemption is allowed — a resolved
// (APPROVED or REJECTED) prior cycle for the same reward must not block a
// new, independent request cycle, unlike an unresolved PENDING one.
test('a reward with a prior APPROVED cycle can be requested again when otherwise eligible', async () => {
  seedReward();
  seedBalance(100);
  useAppStore.getState().setRewardRedemptions([
    {
      id: 'old-cycle', householdId: HOUSEHOLD_ID, rewardId: 'reward-1', requestedByProfileId: CHILD_ID,
      clientRequestId: 'old-key', pointsRequiredSnapshot: 50, status: 'approved',
      reviewedByProfileId: 'adult-1', reviewedAt: new Date().toISOString(),
      requestedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ]);

  const result = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'new-key',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.redemption.status, 'pending');
  assert.equal(useAppStore.getState().rewardRedemptions.length, 2);
});

test('a reward with a prior REJECTED cycle can be requested again when otherwise eligible', async () => {
  seedReward();
  seedBalance(100);
  useAppStore.getState().setRewardRedemptions([
    {
      id: 'old-cycle', householdId: HOUSEHOLD_ID, rewardId: 'reward-1', requestedByProfileId: CHILD_ID,
      clientRequestId: 'old-key', pointsRequiredSnapshot: 50, status: 'rejected',
      reviewedByProfileId: 'adult-1', reviewedAt: new Date().toISOString(),
      requestedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ]);

  const result = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'new-key',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.redemption.status, 'pending');
  assert.equal(useAppStore.getState().rewardRedemptions.length, 2);
});

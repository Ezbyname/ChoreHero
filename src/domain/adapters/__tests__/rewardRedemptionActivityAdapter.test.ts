import assert from 'node:assert/strict';
import test from 'node:test';
import { RewardRedemptionAdapter } from '@/domain/adapters/rewardRedemptionActivityAdapter';
import type { Reward, RewardRedemption } from '@/types';

function makeRedemption(overrides: Partial<RewardRedemption> = {}): RewardRedemption {
  return {
    id:                     'r1',
    householdId:            'house-1',
    rewardId:               'reward-1',
    requestedByProfileId:   'child-1',
    clientRequestId:        'key-1',
    pointsRequiredSnapshot: 50,
    status:                 'pending',
    requestedAt:            '2026-08-22T09:00:00.000Z',
    createdAt:              '2026-08-22T09:00:00.000Z',
    updatedAt:              '2026-08-22T09:00:00.000Z',
    ...overrides,
  };
}

function makeReward(overrides: Partial<Reward> = {}): Reward {
  return {
    id:             'reward-1',
    householdId:    'house-1',
    title:          'Movie Night',
    requiredPoints: 50,
    isActive:       true,
    ...overrides,
  };
}

// ── Actionability: only PENDING rows are actionable ───────────────────────────

test('a pending redemption for an active reward exposes approve and decline', () => {
  const activity = RewardRedemptionAdapter.toFamilyActivity(makeRedemption(), makeReward());
  assert.equal(activity.status, 'pending');
  assert.deepEqual(activity.availableActions, ['approve', 'decline']);
});

test('approved and rejected redemptions expose no further actions, even for an active reward', () => {
  const approved = RewardRedemptionAdapter.toFamilyActivity(makeRedemption({ status: 'approved' }), makeReward());
  assert.equal(approved.status, 'completed');
  assert.deepEqual(approved.availableActions, []);

  const rejected = RewardRedemptionAdapter.toFamilyActivity(makeRedemption({ status: 'rejected' }), makeReward());
  assert.equal(rejected.status, 'declined');
  assert.deepEqual(rejected.availableActions, []);
});

// ── Decision 7: archived reward, existing PENDING redemption ─────────────────

test('a pending redemption for an archived reward exposes decline only, not approve', () => {
  const activity = RewardRedemptionAdapter.toFamilyActivity(makeRedemption(), makeReward({ isActive: false }));
  assert.deepEqual(activity.availableActions, ['decline']);
});

test('an archived reward does not strip a resolved redemption further (still no actions)', () => {
  const activity = RewardRedemptionAdapter.toFamilyActivity(
    makeRedemption({ status: 'rejected' }),
    makeReward({ isActive: false }),
  );
  assert.deepEqual(activity.availableActions, []);
});

// A reward row missing entirely (should not normally happen — see the
// adapter's own comment) is treated as not-archived rather than blocking
// the redemption from being reviewable at all.
test('a missing reward row does not remove approve/decline (treated as not archived)', () => {
  const activity = RewardRedemptionAdapter.toFamilyActivity(makeRedemption(), undefined);
  assert.deepEqual(activity.availableActions, ['approve', 'decline']);
  assert.equal(activity.title, 'reward-1'); // falls back to the raw reward id
});

// ── Reviewer context ───────────────────────────────────────────────────────────

test('the requester becomes the activity creator, not the target — reviewer is role-gated, not member-specific', () => {
  const activity = RewardRedemptionAdapter.toFamilyActivity(
    makeRedemption({ requestedByProfileId: 'child-2' }),
    makeReward(),
  );
  assert.equal(activity.createdByProfileId, 'child-2');
  assert.equal(activity.targetProfileId, undefined);
});

test('the reward title is used for display', () => {
  const activity = RewardRedemptionAdapter.toFamilyActivity(makeRedemption(), makeReward({ title: 'Sleep In' }));
  assert.equal(activity.title, 'Sleep In');
});

// ── points_required_snapshot is the authoritative approval cost ──────────────

test('displayed points always come from points_required_snapshot, never the reward\'s current points_required', () => {
  const activity = RewardRedemptionAdapter.toFamilyActivity(
    makeRedemption({ pointsRequiredSnapshot: 50 }),
    makeReward({ requiredPoints: 999 }), // price changed after the request
  );
  assert.equal(activity.points, 50);
});

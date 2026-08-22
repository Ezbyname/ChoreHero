import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import {
  selectCanRequestRedemption,
  selectCanApproveRedemption,
  selectCanRejectRedemption,
  selectPendingRedemptionCount,
  selectHasPendingRedemptionsToReview,
  selectRewardRedemptionsForCurrentUser,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import type { RewardRedemption } from '@/types';

const HOUSEHOLD_ID = 'house-1';

function seedViewer(userId: string, role: 'owner' | 'admin' | 'adult' | 'child'): void {
  useAppStore.getState().setUser({ id: userId, name: 'Viewer' });
  useAppStore.getState().setHousehold({
    id:      HOUSEHOLD_ID,
    name:    'Test Household',
    members: [{ id: `member-${userId}`, userId, name: 'Viewer', role }],
  });
}

function seedRedemptions(redemptions: RewardRedemption[]): void {
  useAppStore.getState().setRewardRedemptions(redemptions);
}

function makeRedemption(overrides: Partial<RewardRedemption>): RewardRedemption {
  return {
    id:                     'redemption-1',
    householdId:            HOUSEHOLD_ID,
    rewardId:               'reward-1',
    requestedByProfileId:   'child-1',
    clientRequestId:        'key-1',
    pointsRequiredSnapshot: 50,
    status:                 'pending',
    requestedAt:            new Date().toISOString(),
    createdAt:              new Date().toISOString(),
    updatedAt:              new Date().toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  useAppStore.getState().resetAppState();
});

// ── selectCanRequestRedemption ────────────────────────────────────────────────

test('a child exposes request capability', () => {
  seedViewer('child-1', 'child');
  assert.equal(selectCanRequestRedemption(useAppStore.getState()), true);
});

// The permission hierarchy structurally gives an adult the
// rewards.request_redemption string too (inherited from CHILD_PERMISSIONS) —
// the selector must not surface that inheritance as request authorization.
test('an adult does not become request-authorized merely because the permission hierarchy contains the inherited string', () => {
  seedViewer('adult-1', 'adult');
  assert.equal(selectCanRequestRedemption(useAppStore.getState()), false);
});

test('an owner does not become request-authorized either', () => {
  seedViewer('owner-1', 'owner');
  assert.equal(selectCanRequestRedemption(useAppStore.getState()), false);
});

// ── selectCanApproveRedemption / selectCanRejectRedemption ───────────────────

test('a child does not expose approve or reject capability', () => {
  seedViewer('child-1', 'child');
  assert.equal(selectCanApproveRedemption(useAppStore.getState()), false);
  assert.equal(selectCanRejectRedemption(useAppStore.getState()), false);
});

test('adult, admin, and owner each expose review capability', () => {
  for (const role of ['adult', 'admin', 'owner'] as const) {
    seedViewer(`${role}-1`, role);
    assert.equal(selectCanApproveRedemption(useAppStore.getState()), true, `${role} approve`);
    assert.equal(selectCanRejectRedemption(useAppStore.getState()), true, `${role} reject`);
  }
});

// ── selectPendingRedemptionCount / selectHasPendingRedemptionsToReview ───────

test('pending redemption count is scoped to pending status only', () => {
  seedViewer('adult-1', 'adult');
  seedRedemptions([
    makeRedemption({ id: 'r1', status: 'pending' }),
    makeRedemption({ id: 'r2', status: 'approved' }),
    makeRedemption({ id: 'r3', status: 'pending' }),
    makeRedemption({ id: 'r4', status: 'rejected' }),
  ]);

  assert.equal(selectPendingRedemptionCount(useAppStore.getState()), 2);
});

test('review visibility requires both approve capability and a nonzero pending count', () => {
  seedRedemptions([makeRedemption({ id: 'r1', status: 'pending' })]);

  seedViewer('adult-1', 'adult');
  assert.equal(selectHasPendingRedemptionsToReview(useAppStore.getState()), true);

  seedViewer('child-1', 'child');
  assert.equal(selectHasPendingRedemptionsToReview(useAppStore.getState()), false);
});

test('no pending redemptions means no review visibility even for an adult', () => {
  seedViewer('adult-1', 'adult');
  seedRedemptions([makeRedemption({ id: 'r1', status: 'approved' })]);

  assert.equal(selectHasPendingRedemptionsToReview(useAppStore.getState()), false);
});

// ── selectRewardRedemptionsForCurrentUser ─────────────────────────────────────

// An adult+'s array may contain the whole household's redemptions
// (Decision 11) — a viewer's "own redemptions" selector must filter by
// requestedByProfileId, never assume the array is already scoped to them.
test('another child\'s redemption is not treated as the current user\'s own redemption', () => {
  seedViewer('child-1', 'child');
  seedRedemptions([
    makeRedemption({ id: 'r1', requestedByProfileId: 'child-1' }),
    makeRedemption({ id: 'r2', requestedByProfileId: 'child-2' }),
  ]);

  const mine = selectRewardRedemptionsForCurrentUser(useAppStore.getState());
  assert.equal(mine.length, 1);
  assert.equal(mine[0]?.id, 'r1');
});

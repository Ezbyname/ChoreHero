import assert from 'node:assert/strict';
import test from 'node:test';

import { computeMyPointsSummary, selectReservedPendingSnapshots } from '@/features/rewards/pointsSummary';
import type { RewardRedemption } from '@/types';

const CHILD_ID  = 'child-1';
const OTHER_ID  = 'child-2';

function makeRedemption(overrides: Partial<RewardRedemption> = {}): RewardRedemption {
  return {
    id:                     'r1',
    householdId:            'house-1',
    rewardId:               'reward-1',
    requestedByProfileId:   CHILD_ID,
    clientRequestId:        'key-1',
    pointsRequiredSnapshot: 50,
    status:                 'pending',
    reservationModel:       'reserved',
    requestedAt:            '2026-08-30T09:00:00.000Z',
    createdAt:              '2026-08-30T09:00:00.000Z',
    updatedAt:              '2026-08-30T09:00:00.000Z',
    ...overrides,
  };
}

// Reward Reserved Points — proves the pure client-side formula matches the
// backend's own reservation formula exactly: available = gross - pending,
// where pending is the sum of the viewer's own currently-PENDING
// pointsRequiredSnapshot values.

test('no pending reservations: available equals gross balance, pending is 0', () => {
  const result = computeMyPointsSummary(100, []);
  assert.deepEqual(result, { available: 100, pending: 0 });
});

test('a single pending reservation is subtracted from gross balance', () => {
  const result = computeMyPointsSummary(100, [30]);
  assert.deepEqual(result, { available: 70, pending: 30 });
});

// Multi-reservation scenario: several concurrent pending requests for this
// child all reserve simultaneously — pending is their sum, not just the
// most recent one.
test('multiple pending reservations sum together', () => {
  const result = computeMyPointsSummary(100, [30, 20, 10]);
  assert.deepEqual(result, { available: 40, pending: 60 });
});

test('pending reservations may exceed gross balance, yielding a negative available', () => {
  // Not expected in practice (the backend's FOR UPDATE lock prevents this
  // from ever being reachable via the RPC), but the pure function itself
  // must not clamp or throw — it is a straight arithmetic projection, and
  // clamping here would hide a real accounting bug from a caller instead
  // of surfacing it.
  const result = computeMyPointsSummary(50, [30, 30]);
  assert.deepEqual(result, { available: -10, pending: 60 });
});

test('zero gross balance with no reservations', () => {
  const result = computeMyPointsSummary(0, []);
  assert.deepEqual(result, { available: 0, pending: 0 });
});

test('does not mutate the input snapshots array', () => {
  const snapshots = [10, 20];
  computeMyPointsSummary(100, snapshots);
  assert.deepEqual(snapshots, [10, 20]);
});

// ── selectReservedPendingSnapshots — legacy compatibility ─────────────────
//
// The previous Product contract allowed a PENDING redemption with NO
// reservation. A row created under that contract is marked
// reservationModel: 'legacy' (see types/reward.ts and the migration's own
// comment) and must never enter the reservation sum — deploying this
// feature must not retroactively shrink anyone's Available balance for a
// request made before this feature existed.

test('a legacy pending row is excluded — does not reduce Available', () => {
  const redemptions = [makeRedemption({ reservationModel: 'legacy', pointsRequiredSnapshot: 40 })];
  const snapshots = selectReservedPendingSnapshots(redemptions, CHILD_ID);
  assert.deepEqual(snapshots, []);
  assert.deepEqual(computeMyPointsSummary(100, snapshots), { available: 100, pending: 0 });
});

test('a new-model (reserved) pending row is included — does reduce Available', () => {
  const redemptions = [makeRedemption({ reservationModel: 'reserved', pointsRequiredSnapshot: 40 })];
  const snapshots = selectReservedPendingSnapshots(redemptions, CHILD_ID);
  assert.deepEqual(snapshots, [40]);
  assert.deepEqual(computeMyPointsSummary(100, snapshots), { available: 60, pending: 40 });
});

test('mixed legacy + new-model pending rows: only the new-model row counts toward Pending', () => {
  const redemptions = [
    makeRedemption({ id: 'legacy-row', reservationModel: 'legacy',  pointsRequiredSnapshot: 40 }),
    makeRedemption({ id: 'new-row',    reservationModel: 'reserved', pointsRequiredSnapshot: 25 }),
  ];
  const snapshots = selectReservedPendingSnapshots(redemptions, CHILD_ID);
  assert.deepEqual(snapshots, [25]);
  assert.deepEqual(computeMyPointsSummary(100, snapshots), { available: 75, pending: 25 });
});

test('a resolved (non-pending) row never counts, regardless of reservation model', () => {
  const redemptions = [
    makeRedemption({ status: 'approved', reservationModel: 'reserved' }),
    makeRedemption({ status: 'rejected', reservationModel: 'legacy' }),
  ];
  assert.deepEqual(selectReservedPendingSnapshots(redemptions, CHILD_ID), []);
});

test('another child\'s pending rows never count toward this viewer\'s snapshots', () => {
  const redemptions = [makeRedemption({ requestedByProfileId: OTHER_ID, reservationModel: 'reserved' })];
  assert.deepEqual(selectReservedPendingSnapshots(redemptions, CHILD_ID), []);
});

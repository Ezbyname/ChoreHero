import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { requestRewardRedemption } from '@/features/rewards/requestRewardRedemption';
import { rejectRewardRedemption } from '@/features/rewards/rejectRewardRedemption';
import { cancelRewardRedemption } from '@/features/rewards/cancelRewardRedemption';
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
      clientRequestId: 'old-key', pointsRequiredSnapshot: 50, status: 'approved', reservationModel: 'reserved',
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
      clientRequestId: 'old-key', pointsRequiredSnapshot: 50, status: 'rejected', reservationModel: 'reserved',
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

// Reward Reserved Points — a CANCELLED cycle, like APPROVED/REJECTED, is
// terminal and must not block a new request cycle for the same reward.
test('a reward with a prior CANCELLED cycle can be requested again when otherwise eligible', async () => {
  seedReward();
  seedBalance(100);
  useAppStore.getState().setRewardRedemptions([
    {
      id: 'old-cycle', householdId: HOUSEHOLD_ID, rewardId: 'reward-1', requestedByProfileId: CHILD_ID,
      clientRequestId: 'old-key', pointsRequiredSnapshot: 50, status: 'cancelled', reservationModel: 'reserved',
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

// ── Reward Reserved Points — reservation-aware balance accounting ────────

// Gross balance alone is sufficient, but another PENDING reservation for a
// different reward already claims enough of it that AVAILABLE balance is
// not — this is the exact scenario the old model could never catch client-
// side (and the real Send-Request QA failure's replacement model must).
test('sufficient gross balance but insufficient AVAILABLE balance (reserved by another pending request) returns insufficient_balance', async () => {
  useAppStore.getState().setRewards([
    { id: 'reward-1', householdId: HOUSEHOLD_ID, title: 'Movie Night', requiredPoints: 50, isActive: true },
    { id: 'reward-2', householdId: HOUSEHOLD_ID, title: 'Sleep In',    requiredPoints: 60, isActive: true },
  ]);
  seedBalance(100);
  useAppStore.getState().setRewardRedemptions([
    {
      id: 'other-pending', householdId: HOUSEHOLD_ID, rewardId: 'reward-2', requestedByProfileId: CHILD_ID,
      clientRequestId: 'other-key', pointsRequiredSnapshot: 60, status: 'pending', reservationModel: 'reserved',
      requestedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ]);

  // Gross balance is 100, this request needs 50 (100 >= 50 under the old
  // model), but 60 is already reserved by the other pending request, so
  // available is only 40 — insufficient under the new model.
  const result = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'insufficient_balance' });
  assert.equal(useAppStore.getState().rewardRedemptions.length, 1);
});

// Multi-reservation scenario: several other children's pending requests in
// the same household must never count against this child's own reserved
// sum — reservation is per-child, not per-household.
test('another child\'s pending reservation in the same household does not reduce this child\'s available balance', async () => {
  useAppStore.getState().setRewards([
    { id: 'reward-1', householdId: HOUSEHOLD_ID, title: 'Movie Night', requiredPoints: 50, isActive: true },
  ]);
  seedBalance(100);
  useAppStore.getState().setPointsBalances([
    { userId: CHILD_ID, householdId: HOUSEHOLD_ID, balance: 100 },
    { userId: 'child-2', householdId: HOUSEHOLD_ID, balance: 100 },
  ]);
  useAppStore.getState().setRewardRedemptions([
    {
      id: 'sibling-pending', householdId: HOUSEHOLD_ID, rewardId: 'reward-1', requestedByProfileId: 'child-2',
      clientRequestId: 'sibling-key', pointsRequiredSnapshot: 90, status: 'pending', reservationModel: 'reserved',
      requestedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ]);

  const result = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-1',
  });

  assert.equal(result.ok, true);
});

// A second, different-reward request while a first is still pending must
// account for the first reservation exactly — not double-count, not ignore
// it.
test('a second request for a different reward is blocked once combined reservations exceed gross balance', async () => {
  useAppStore.getState().setRewards([
    { id: 'reward-1', householdId: HOUSEHOLD_ID, title: 'Movie Night', requiredPoints: 60, isActive: true },
    { id: 'reward-2', householdId: HOUSEHOLD_ID, title: 'Sleep In',    requiredPoints: 50, isActive: true },
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

  // 100 gross - 60 already reserved = 40 available, reward-2 needs 50.
  const second = await requestRewardRedemption({
    rewardId:             'reward-2',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'key-2',
  });

  assert.deepEqual(second, { ok: false, reason: 'insufficient_balance' });
  assert.equal(useAppStore.getState().rewardRedemptions.length, 1);
});

// ── Legacy Pending compatibility (Final Pre-Commit Closure Gate) ─────────
//
// The previous Product contract allowed a PENDING redemption with NO
// points reservation. A row created under that contract carries
// reservationModel: 'legacy' and must be excluded from the reserved sum —
// deploying this feature alone must never retroactively reduce a child's
// Available balance for a request they made before this feature existed.
// No real legacy PENDING rows are known to exist (QA verified zero for
// the tested household; the QA seed fixture and mock seed data create
// zero reward_redemptions rows of any kind), but Production cannot be
// verified from this sandbox, so this compatibility path is exercised
// directly rather than assumed unreachable.

test('a legacy pending row does not reduce AVAILABLE balance for a new request', async () => {
  // A DIFFERENT reward than the legacy row's own — this isolates the
  // balance/reservation path from Decision 8's unrelated one-pending-
  // per-(child,reward) rule, which a same-reward legacy row would also
  // (correctly) trip regardless of reservation model.
  useAppStore.getState().setRewards([
    { id: 'reward-1', householdId: HOUSEHOLD_ID, title: 'Movie Night', requiredPoints: 50, isActive: true },
    { id: 'reward-2', householdId: HOUSEHOLD_ID, title: 'Sleep In',    requiredPoints: 20, isActive: true },
  ]);
  seedBalance(100);
  useAppStore.getState().setRewardRedemptions([
    {
      id: 'legacy-row', householdId: HOUSEHOLD_ID, rewardId: 'reward-2', requestedByProfileId: CHILD_ID,
      clientRequestId: 'legacy-key', pointsRequiredSnapshot: 90, status: 'pending', reservationModel: 'legacy',
      requestedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ]);

  // Under the OLD contract this legacy row reserved nothing — full gross
  // balance (100) remains available for reward-1. If the legacy row were
  // incorrectly treated as a reservation, 100 - 90 = 10 would be
  // insufficient for this request (needs 50) and this would fail instead.
  const result = await requestRewardRedemption({
    rewardId:             'reward-1',
    householdId:          HOUSEHOLD_ID,
    requestedByProfileId: CHILD_ID,
    role:                 'child',
    clientRequestId:      'new-key',
  });

  assert.equal(result.ok, true);
});

// A legacy pending row still counts for Decision 8 (one pending per
// child+reward) — that rule is orthogonal to reservation accounting and
// must remain unaffected by the legacy/new-model distinction.
test('a legacy pending row for the SAME reward still blocks a duplicate request (Decision 8 unaffected)', async () => {
  seedReward();
  seedBalance(100);
  useAppStore.getState().setRewardRedemptions([
    {
      id: 'legacy-row', householdId: HOUSEHOLD_ID, rewardId: 'reward-1', requestedByProfileId: CHILD_ID,
      clientRequestId: 'legacy-key', pointsRequiredSnapshot: 50, status: 'pending', reservationModel: 'legacy',
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

  assert.deepEqual(result, { ok: false, reason: 'duplicate_pending' });
});

// ── Reservation release — reject/cancel free the reserved amount exactly once ──

test('rejecting a new-model pending redemption releases its reservation for a subsequent request', async () => {
  useAppStore.getState().setRewards([
    { id: 'reward-1', householdId: HOUSEHOLD_ID, title: 'Movie Night', requiredPoints: 60, isActive: true },
    { id: 'reward-2', householdId: HOUSEHOLD_ID, title: 'Sleep In',    requiredPoints: 50, isActive: true },
  ]);
  seedBalance(100);

  const first = await requestRewardRedemption({
    rewardId: 'reward-1', householdId: HOUSEHOLD_ID, requestedByProfileId: CHILD_ID,
    role: 'child', clientRequestId: 'key-1',
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  // Before release: 100 - 60 = 40 available, reward-2 needs 50 — blocked.
  const blocked = await requestRewardRedemption({
    rewardId: 'reward-2', householdId: HOUSEHOLD_ID, requestedByProfileId: CHILD_ID,
    role: 'child', clientRequestId: 'key-2',
  });
  assert.deepEqual(blocked, { ok: false, reason: 'insufficient_balance' });

  const rejected = await rejectRewardRedemption({
    redemptionId: first.redemption.id, householdId: HOUSEHOLD_ID,
    role: 'adult', reviewedByProfileId: 'adult-1',
  });
  assert.deepEqual(rejected, { ok: true });

  // After release: full 100 available again.
  const afterRelease = await requestRewardRedemption({
    rewardId: 'reward-2', householdId: HOUSEHOLD_ID, requestedByProfileId: CHILD_ID,
    role: 'child', clientRequestId: 'key-3',
  });
  assert.equal(afterRelease.ok, true);
});

test('a child cancelling their own pending redemption releases its reservation for a subsequent request', async () => {
  useAppStore.getState().setRewards([
    { id: 'reward-1', householdId: HOUSEHOLD_ID, title: 'Movie Night', requiredPoints: 60, isActive: true },
    { id: 'reward-2', householdId: HOUSEHOLD_ID, title: 'Sleep In',    requiredPoints: 50, isActive: true },
  ]);
  seedBalance(100);

  const first = await requestRewardRedemption({
    rewardId: 'reward-1', householdId: HOUSEHOLD_ID, requestedByProfileId: CHILD_ID,
    role: 'child', clientRequestId: 'key-1',
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const cancelled = await cancelRewardRedemption({
    redemptionId: first.redemption.id, householdId: HOUSEHOLD_ID,
    role: 'child', requestedByProfileId: CHILD_ID,
  });
  assert.deepEqual(cancelled, { ok: true });

  const afterRelease = await requestRewardRedemption({
    rewardId: 'reward-2', householdId: HOUSEHOLD_ID, requestedByProfileId: CHILD_ID,
    role: 'child', clientRequestId: 'key-2',
  });
  assert.equal(afterRelease.ok, true);
});

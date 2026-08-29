import assert from 'node:assert/strict';
import test from 'node:test';
import { sortRewardsForDisplay } from '@/features/rewards/sortRewards';
import type { Reward } from '@/types';

// A2 — Reward Sorting. Locked Product contract: requiredPoints ASC, then
// title ASC (plain ordinal comparison), then id ASC as the final
// deterministic tie-breaker. Global and viewer-independent by construction
// — the helper's signature has no balance/viewer parameter at all.

function reward(overrides: Partial<Reward> & Pick<Reward, 'id' | 'title' | 'requiredPoints'>): Reward {
  return {
    householdId: 'household-1',
    isActive:    true,
    ...overrides,
  };
}

test('Test 1 — primary ordering by requiredPoints ASC', () => {
  const rewards = [
    reward({ id: 'a', title: 'Movie',  requiredPoints: 100 }),
    reward({ id: 'b', title: 'Ice Cream', requiredPoints: 20 }),
    reward({ id: 'c', title: 'Game',   requiredPoints: 50 }),
  ];

  const sorted = sortRewardsForDisplay(rewards);

  assert.deepEqual(sorted.map((r) => r.requiredPoints), [20, 50, 100]);
});

test('Test 2 — secondary ordering by title ASC when requiredPoints is equal', () => {
  const rewards = [
    reward({ id: 'a', title: 'Movie',     requiredPoints: 20 }),
    reward({ id: 'b', title: 'Ice Cream', requiredPoints: 20 }),
    reward({ id: 'c', title: 'Book',      requiredPoints: 20 }),
  ];

  const sorted = sortRewardsForDisplay(rewards);

  assert.deepEqual(sorted.map((r) => r.title), ['Book', 'Ice Cream', 'Movie']);
});

test('Test 3 — final id ASC tie-breaker when requiredPoints and title are equal', () => {
  const rewards = [
    reward({ id: 'id-b', title: 'Movie', requiredPoints: 100 }),
    reward({ id: 'id-a', title: 'Movie', requiredPoints: 100 }),
  ];

  const sorted = sortRewardsForDisplay(rewards);

  assert.deepEqual(sorted.map((r) => r.id), ['id-a', 'id-b']);
});

test('Test 4 — full comparator chain: requiredPoints -> title -> id, in that exact order', () => {
  const rewards = [
    reward({ id: 'id-z', title: 'Zebra',  requiredPoints: 50 }),
    reward({ id: 'id-b', title: 'Movie',  requiredPoints: 100 }),
    reward({ id: 'id-y', title: 'Movie',  requiredPoints: 100 }),
    reward({ id: 'id-x', title: 'Book',   requiredPoints: 20 }),
    reward({ id: 'id-a', title: 'Movie',  requiredPoints: 100 }),
  ];

  const sorted = sortRewardsForDisplay(rewards);

  assert.deepEqual(
    sorted.map((r) => r.id),
    ['id-x', 'id-z', 'id-a', 'id-b', 'id-y'],
  );
});

test('Test 5 — viewer balance independence: the API takes no balance input and identical rewards always sort identically', () => {
  const rewards = [
    reward({ id: 'a', title: 'Movie',     requiredPoints: 100 }),
    reward({ id: 'b', title: 'Ice Cream', requiredPoints: 20 }),
  ];

  // sortRewardsForDisplay's signature is (rewards: Reward[]) => Reward[] —
  // structurally incapable of taking a balance/viewer argument. The same
  // input therefore produces the same order regardless of any balance a
  // caller might otherwise have had in mind for a given viewer.
  const resultForLowBalanceViewer  = sortRewardsForDisplay(rewards);
  const resultForHighBalanceViewer = sortRewardsForDisplay(rewards);

  assert.deepEqual(
    resultForLowBalanceViewer.map((r) => r.id),
    resultForHighBalanceViewer.map((r) => r.id),
  );
  assert.deepEqual(resultForLowBalanceViewer.map((r) => r.id), ['b', 'a']);
});

test('Test 6 — input array is not mutated', () => {
  const original = [
    reward({ id: 'a', title: 'Movie',     requiredPoints: 100 }),
    reward({ id: 'b', title: 'Ice Cream', requiredPoints: 20 }),
  ];
  const originalOrderSnapshot = original.map((r) => r.id);

  const sorted = sortRewardsForDisplay(original);

  assert.deepEqual(original.map((r) => r.id), originalOrderSnapshot);
  assert.notEqual(sorted, original);
});

test('Test 7 — empty input returns empty output', () => {
  assert.deepEqual(sortRewardsForDisplay([]), []);
});

test('Test 8 — single reward returns an equivalent single-item result', () => {
  const single = [reward({ id: 'a', title: 'Movie', requiredPoints: 100 })];

  const sorted = sortRewardsForDisplay(single);

  assert.equal(sorted.length, 1);
  assert.deepEqual(sorted[0], single[0]);
});

test('Test 9 — deterministic across repeated calls', () => {
  const rewards = [
    reward({ id: 'id-z', title: 'Zebra', requiredPoints: 50 }),
    reward({ id: 'id-b', title: 'Movie', requiredPoints: 100 }),
    reward({ id: 'id-y', title: 'Movie', requiredPoints: 100 }),
    reward({ id: 'id-x', title: 'Book',  requiredPoints: 20 }),
  ];

  const firstRun  = sortRewardsForDisplay(rewards).map((r) => r.id);
  const secondRun = sortRewardsForDisplay(rewards).map((r) => r.id);
  const thirdRun  = sortRewardsForDisplay(rewards).map((r) => r.id);

  assert.deepEqual(firstRun, secondRun);
  assert.deepEqual(secondRun, thirdRun);
});

test('Test 10 — sorting operates only on whatever list it is given; it does not itself filter archived rewards (that remains the screen\'s existing job)', () => {
  const rewards = [
    reward({ id: 'a', title: 'Movie', requiredPoints: 100, isActive: true }),
    reward({ id: 'b', title: 'Old Reward', requiredPoints: 20, isActive: false }),
  ];

  const sorted = sortRewardsForDisplay(rewards);

  // Both are still present — sortRewardsForDisplay has no isActive-aware
  // logic of its own. Visibility filtering stays RewardsScreen's
  // responsibility, applied before this helper is ever called.
  assert.equal(sorted.length, 2);
  assert.deepEqual(sorted.map((r) => r.id), ['b', 'a']);
});

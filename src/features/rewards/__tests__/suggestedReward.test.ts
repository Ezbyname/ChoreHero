import assert from 'node:assert/strict';
import test from 'node:test';

import { selectSuggestedReward, type SuggestedReward } from '@/features/rewards/suggestedReward';
import type { Reward, RewardRedemption } from '@/types';

const KID = 'kid-1';

function r(id: string, requiredPoints: number, over: Partial<Reward> = {}): Reward {
  return { id, householdId: 'hh', title: id, requiredPoints, isActive: true, ...over };
}

type Red = Pick<RewardRedemption, 'rewardId' | 'requestedByProfileId' | 'status'>;

function run(rewards: Reward[], availablePoints: number, redemptions: Red[] = []): SuggestedReward {
  return selectSuggestedReward({ rewards, redemptions, viewerId: KID, availablePoints });
}

function pickedId(s: SuggestedReward): string | null {
  return s.kind === 'suggested' ? s.reward.id : null;
}

test('one unaffordable reward is suggested with pointsRemaining', () => {
  assert.deepEqual(run([r('bike', 100)], 30), { kind: 'suggested', reward: r('bike', 100), pointsRemaining: 70 });
});

test('several unaffordable rewards → nearest / lowest cost wins', () => {
  const s = run([r('big', 100), r('mid', 40), r('huge', 500)], 25);
  assert.deepEqual(s, { kind: 'suggested', reward: r('mid', 40), pointsRemaining: 15 });
});

test('affordable reward is ignored for Suggested (incl. exactly-enough points)', () => {
  assert.deepEqual(run([r('cheap', 10)], 50), { kind: 'none' });
  assert.deepEqual(run([r('exact', 30)], 30), { kind: 'none' });
});

test('mix of affordable and unaffordable → nearest unaffordable wins', () => {
  const s = run([r('small', 10), r('ready', 50), r('next', 60), r('far', 200)], 50);
  assert.deepEqual(s, { kind: 'suggested', reward: r('next', 60), pointsRemaining: 10 });
});

test('reward with this child\'s pending request is excluded; others\' / resolved requests are not', () => {
  const rewards = [r('near', 60), r('far', 90)];
  assert.equal(pickedId(run(rewards, 50, [{ rewardId: 'near', requestedByProfileId: KID, status: 'pending' }])), 'far');
  assert.equal(pickedId(run(rewards, 50, [
    { rewardId: 'near', requestedByProfileId: 'kid-2', status: 'pending' },
    { rewardId: 'near', requestedByProfileId: KID, status: 'rejected' },
  ])), 'near');
});

test('inactive reward is excluded', () => {
  assert.equal(pickedId(run([r('off', 60, { isActive: false }), r('on', 80)], 50)), 'on');
  assert.deepEqual(run([r('off', 60, { isActive: false })], 50), { kind: 'none' });
});

test('deterministic tie: title then id, independent of input order', () => {
  const rewards = [
    r('id-2', 70, { title: 'Ice cream' }),
    r('id-1', 70, { title: 'Ice cream' }),
    r('id-0', 70, { title: 'Zoo' }),
    r('id-9', 70, { title: 'Arcade' }),
  ];
  assert.equal(pickedId(run(rewards, 10)), 'id-9');
  const noArcade = rewards.filter((x) => x.id !== 'id-9');
  assert.equal(pickedId(run(noArcade, 10)), 'id-1');
  assert.equal(pickedId(run([...noArcade].reverse(), 10)), 'id-1');
});

test('all rewards affordable → none', () => {
  assert.deepEqual(run([r('a', 10), r('b', 20), r('c', 30)], 30), { kind: 'none' });
});

test('no rewards → none', () => {
  assert.deepEqual(run([], 0), { kind: 'none' });
});

test('does not mutate the input array', () => {
  const rewards = [r('b', 200), r('a', 100)];
  run(rewards, 0);
  assert.deepEqual(rewards.map((x) => x.id), ['b', 'a']);
});

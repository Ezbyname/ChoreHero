import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { createReward } from '@/features/rewards/createReward';
import { useAppStore } from '@/store/useAppStore';

afterEach(() => {
  useAppStore.getState().resetAppState();
});

test('missing rewards.create permission returns not_authorized without touching the store', async () => {
  const before = useAppStore.getState().rewards.length;

  const result = await createReward({
    householdId:        'house-1',
    title:               'Extra dessert',
    requiredPoints:      20,
    createdByProfileId:  'parent-1',
    role:                null,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
  assert.equal(useAppStore.getState().rewards.length, before);
});

// child is not granted rewards.create (adult+ only) — see permissions.ts.
test('child role is not authorized to create a reward', async () => {
  const result = await createReward({
    householdId:        'house-1',
    title:               'Extra dessert',
    requiredPoints:      20,
    createdByProfileId:  'child-1',
    role:                'child',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('empty/whitespace-only title is invalid_input', async () => {
  const result = await createReward({
    householdId:        'house-1',
    title:               '   ',
    requiredPoints:      20,
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'invalid_input' });
});

// Mirrors the DB's own chk_rewards_points_positive constraint
// (points_required > 0) — not an invented rule, just enforced client-side
// too so it surfaces as invalid_input rather than a raw DB error.
test('zero points required is invalid_input', async () => {
  const result = await createReward({
    householdId:        'house-1',
    title:               'Extra dessert',
    requiredPoints:      0,
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'invalid_input' });
});

test('negative points required is invalid_input', async () => {
  const result = await createReward({
    householdId:        'house-1',
    title:               'Extra dessert',
    requiredPoints:      -5,
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'invalid_input' });
});

test('non-integer points required is invalid_input', async () => {
  const result = await createReward({
    householdId:        'house-1',
    title:               'Extra dessert',
    requiredPoints:      12.5,
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'invalid_input' });
});

test('creating a reward without a description succeeds with it unset', async () => {
  const result = await createReward({
    householdId:        'house-1',
    title:               'Extra screen time',
    requiredPoints:      15,
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: true });
  const reward = useAppStore.getState().rewards.find((r) => r.title === 'Extra screen time');
  assert.equal(reward?.description, undefined);
  assert.equal(reward?.requiredPoints, 15);
  assert.equal(reward?.isActive, true);
});

// Whitespace-only description normalizes away, matching createTask's own
// description handling.
test('whitespace-only description normalizes away, does not block creation', async () => {
  const result = await createReward({
    householdId:        'house-1',
    title:               'Choose the movie',
    description:         '   ',
    requiredPoints:      10,
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: true });
  const reward = useAppStore.getState().rewards.find((r) => r.title === 'Choose the movie');
  assert.equal(reward?.description, undefined);
});

test('a real description is preserved as-is', async () => {
  const result = await createReward({
    householdId:        'house-1',
    title:               'Sleep in',
    description:         'No morning chores this weekend',
    requiredPoints:      40,
    createdByProfileId:  'parent-1',
    role:                'adult',
  });

  assert.deepEqual(result, { ok: true });
  const reward = useAppStore.getState().rewards.find((r) => r.title === 'Sleep in');
  assert.equal(reward?.description, 'No morning chores this weekend');
});

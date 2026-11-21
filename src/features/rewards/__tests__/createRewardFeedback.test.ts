// Create Reward: a committed insert is never reported as a failure (that
// invited a retry that created the reward twice). Configured mode.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.EXPO_PUBLIC_SUPABASE_URL      = 'https://test.example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';

const { createReward } = await import('@/features/rewards/createReward');
const { useAppStore }  = await import('@/store/useAppStore');
import type { PostgrestError } from '@supabase/supabase-js';

const row = (id: string) => ({
  id, household_id: 'hh', title: 'Movie night', description: null, points_required: 30,
  status: 'active', created_by_profile_id: 'adult-1', created_at: 'x', updated_at: 'x',
}) as never;
const pgErr = { code: 'PGRST500', message: 'x', details: '', hint: '' } as PostgrestError;
const input = { householdId: 'hh', title: 'Movie night', requiredPoints: 30, createdByProfileId: 'adult-1', role: 'adult' };

test('insert ok but the list refresh fails: still ok, reward shown, background refresh asked, ONE insert', async () => {
  useAppStore.setState({ rewards: [] });
  let inserts = 0;
  const refresh: string[] = [];
  const r = await createReward(input, {
    insertFn:       async () => { inserts++; return { data: row('r-new'), error: null }; },
    getRewardsFn:   async () => ({ data: null, error: pgErr }),
    requestRefresh: (reason) => { refresh.push(reason); },
  });
  assert.deepEqual(r, { ok: true });
  assert.equal(inserts, 1);
  assert.deepEqual(useAppStore.getState().rewards.map((x) => x.id), ['r-new']);
  assert.deepEqual(refresh, ['mutation']);
});

test('insert failure is reported as failed and adds nothing', async () => {
  useAppStore.setState({ rewards: [] });
  const r = await createReward(input, {
    insertFn:     async () => ({ data: null, error: pgErr }),
    getRewardsFn: async () => { throw new Error('must not refetch'); },
  });
  assert.deepEqual(r, { ok: false, reason: 'failed' });
  assert.equal(useAppStore.getState().rewards.length, 0);
});

test('happy path: refreshed list applied', async () => {
  useAppStore.setState({ rewards: [] });
  const r = await createReward(input, {
    insertFn:     async () => ({ data: row('r-1'), error: null }),
    getRewardsFn: async () => ({ data: [row('r-1')], error: null }),
  });
  assert.deepEqual(r, { ok: true });
  assert.equal(useAppStore.getState().rewards[0]?.title, 'Movie night');
});

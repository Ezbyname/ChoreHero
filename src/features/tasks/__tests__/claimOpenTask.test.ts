import assert from 'node:assert/strict';
import test from 'node:test';
import { claimOpenTask } from '@/features/tasks/claimOpenTask';

// role: null has no permissions at all (deny-by-default), so this exercises
// the permission gate without ever reaching Supabase/mock-store I/O.
test('missing tasks.claim_open permission returns not_authorized without touching the repository', async () => {
  const result = await claimOpenTask({
    taskId:      'task-1',
    householdId: 'house-1',
    profileId:   'profile-1',
    role:        null,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

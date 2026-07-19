import assert from 'node:assert/strict';
import test from 'node:test';

import { completeTask } from '@/features/tasks/completeTask';

// role: null has no permissions at all, so this exercises the permission
// gate without reaching Supabase/mock-store I/O.
test('missing tasks.complete permission returns not_authorized without touching the repository', async () => {
  const result = await completeTask({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        null,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

// child has tasks.complete, so this exercises the privileged-role guard.
// EX-05 direct completion is owner/admin/adult only; child completion
// requests are a separate EX-06 flow.
test('child role has tasks.complete but is not authorized for direct completion', async () => {
  const result = await completeTask({
    taskId:      'task-1',
    householdId: 'house-1',
    role:        'child',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});
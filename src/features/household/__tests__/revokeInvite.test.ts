import assert from 'node:assert/strict';
import test from 'node:test';

import { revokeInvite } from '@/features/household/revokeInvite';

test('missing household.invite permission returns not_authorized', async () => {
  const result = await revokeInvite({
    inviteId:   'invite-1',
    callerRole: null,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('child role is not authorized to revoke an invite', async () => {
  const result = await revokeInvite({
    inviteId:   'invite-1',
    callerRole: 'child',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('adult role is not authorized to revoke an invite', async () => {
  const result = await revokeInvite({
    inviteId:   'invite-1',
    callerRole: 'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});
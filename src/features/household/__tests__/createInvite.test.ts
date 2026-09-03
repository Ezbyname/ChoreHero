import assert from 'node:assert/strict';
import test from 'node:test';

import { createInvite } from '@/features/household/createInvite';

test('missing household.invite permission returns not_authorized', async () => {
  const result = await createInvite({
    householdId:        'house-1',
    createdByProfileId: 'profile-1',
    role:                'child',
    callerRole:          null,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('child role is not authorized to create an invite', async () => {
  const result = await createInvite({
    householdId:        'house-1',
    createdByProfileId: 'child-1',
    role:                'child',
    callerRole:          'child',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('adult role is not authorized to create an invite', async () => {
  const result = await createInvite({
    householdId:        'house-1',
    createdByProfileId: 'adult-1',
    role:                'child',
    callerRole:          'adult',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});
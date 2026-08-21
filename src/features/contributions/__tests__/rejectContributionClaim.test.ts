import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { rejectContributionClaim } from '@/features/contributions/rejectContributionClaim';
import { useAppStore } from '@/store/useAppStore';
import type { ContributionClaim } from '@/types';

function seedClaim(overrides: Partial<ContributionClaim>): void {
  useAppStore.getState().setContributionClaims([
    {
      id:                 'claim-1',
      householdId:        'house-1',
      title:              'Walked the dog',
      points:             10,
      status:             'pending',
      claimedByProfileId: 'child-1',
      createdAt:          new Date().toISOString(),
      ...overrides,
    },
  ]);
}

afterEach(() => {
  useAppStore.getState().resetAppState();
});

test('missing contributions.reject_claim permission returns not_authorized', async () => {
  const result = await rejectContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                null,
    reviewedByProfileId: 'adult-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('child role is not authorized to reject a claim', async () => {
  const result = await rejectContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'child',
    reviewedByProfileId: 'child-2',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('owner cannot reject their own claim', async () => {
  seedClaim({ claimedByProfileId: 'owner-1' });

  const result = await rejectContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'owner',
    reviewedByProfileId: 'owner-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'self_review' });
  const claim = useAppStore.getState().contributionClaims.find((c) => c.id === 'claim-1');
  assert.equal(claim?.status, 'pending');
});

test('admin cannot reject their own claim', async () => {
  seedClaim({ claimedByProfileId: 'admin-1' });

  const result = await rejectContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'admin',
    reviewedByProfileId: 'admin-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'self_review' });
});

test('adult cannot reject their own claim', async () => {
  seedClaim({ claimedByProfileId: 'adult-1' });

  const result = await rejectContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'adult',
    reviewedByProfileId: 'adult-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'self_review' });
});

test('adult can reject another profile\'s claim', async () => {
  seedClaim({ claimedByProfileId: 'child-1' });

  const result = await rejectContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'adult',
    reviewedByProfileId: 'adult-1',
  });

  assert.deepEqual(result, { ok: true });
  const claim = useAppStore.getState().contributionClaims.find((c) => c.id === 'claim-1');
  assert.equal(claim?.status, 'rejected');
  assert.equal(claim?.reviewedByProfileId, 'adult-1');
});

test('a non-pending claim cannot be rejected, self-review guard notwithstanding', async () => {
  seedClaim({ claimedByProfileId: 'child-1', status: 'rejected' });

  const result = await rejectContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'adult',
    reviewedByProfileId: 'adult-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

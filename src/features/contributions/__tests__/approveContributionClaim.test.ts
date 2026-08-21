import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { approveContributionClaim } from '@/features/contributions/approveContributionClaim';
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

test('missing contributions.approve_claim permission returns not_authorized', async () => {
  const result = await approveContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                null,
    reviewedByProfileId: 'adult-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

test('child role is not authorized to approve a claim', async () => {
  const result = await approveContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'child',
    reviewedByProfileId: 'child-2',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_authorized' });
});

// The confirmed defect: an authorized reviewer (owner/admin/adult) who is
// also the claimant must not be able to approve their own claim.
test('owner cannot approve their own claim', async () => {
  seedClaim({ claimedByProfileId: 'owner-1' });

  const result = await approveContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'owner',
    reviewedByProfileId: 'owner-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'self_review' });
  const claim = useAppStore.getState().contributionClaims.find((c) => c.id === 'claim-1');
  assert.equal(claim?.status, 'pending');
});

test('admin cannot approve their own claim', async () => {
  seedClaim({ claimedByProfileId: 'admin-1' });

  const result = await approveContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'admin',
    reviewedByProfileId: 'admin-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'self_review' });
});

test('adult cannot approve their own claim', async () => {
  seedClaim({ claimedByProfileId: 'adult-1' });

  const result = await approveContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'adult',
    reviewedByProfileId: 'adult-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'self_review' });
});

// Existing behavior, unchanged: an authorized reviewer approving someone
// else's claim still works.
test('adult can approve another profile\'s claim', async () => {
  seedClaim({ claimedByProfileId: 'child-1' });

  const result = await approveContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'adult',
    reviewedByProfileId: 'adult-1',
  });

  assert.deepEqual(result, { ok: true });
  const claim = useAppStore.getState().contributionClaims.find((c) => c.id === 'claim-1');
  assert.equal(claim?.status, 'approved');
  assert.equal(claim?.reviewedByProfileId, 'adult-1');
});

// Existing behavior, unchanged: adult reviewing a child's claim.
test('adult approval of a child\'s claim is unaffected by the self-review guard', async () => {
  seedClaim({ claimedByProfileId: 'child-1' });

  const result = await approveContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'adult',
    reviewedByProfileId: 'adult-1',
  });

  assert.deepEqual(result, { ok: true });
});

test('a non-pending claim cannot be approved, self-review guard notwithstanding', async () => {
  seedClaim({ claimedByProfileId: 'child-1', status: 'approved' });

  const result = await approveContributionClaim({
    claimId:             'claim-1',
    householdId:         'house-1',
    role:                'adult',
    reviewedByProfileId: 'adult-1',
  });

  assert.deepEqual(result, { ok: false, reason: 'not_pending' });
});

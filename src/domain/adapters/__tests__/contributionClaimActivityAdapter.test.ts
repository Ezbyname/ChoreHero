import assert from 'node:assert/strict';
import test from 'node:test';
import { ContributionClaimAdapter } from '@/domain/adapters/contributionClaimActivityAdapter';
import type { ContributionClaim } from '@/types';

function makeClaim(overrides: Partial<ContributionClaim> = {}): ContributionClaim {
  return {
    id:                 'c1',
    householdId:        'house-1',
    title:               'Walked the dog',
    points:              5,
    status:              'pending',
    claimedByProfileId:  'child-1',
    createdAt:           '2026-07-09T09:00:00.000Z',
    ...overrides,
  };
}

test('maps a pending claim to a request-kind activity requiring approval', () => {
  const activity = ContributionClaimAdapter.toFamilyActivity(makeClaim());
  assert.equal(activity.kind, 'request');
  assert.equal(activity.requiresApproval, true);
  assert.equal(activity.status, 'pending');
  assert.deepEqual(activity.availableActions, ['approve', 'decline']);
});

test('the claimant becomes the activity creator, not the target', () => {
  const activity = ContributionClaimAdapter.toFamilyActivity(makeClaim({ claimedByProfileId: 'child-2' }));
  assert.equal(activity.createdByProfileId, 'child-2');
  assert.equal(activity.targetProfileId, undefined);
});

test('approved and rejected claims expose no further actions', () => {
  const approved = ContributionClaimAdapter.toFamilyActivity(makeClaim({ status: 'approved' }));
  assert.equal(approved.status, 'completed');
  assert.deepEqual(approved.availableActions, []);

  const rejected = ContributionClaimAdapter.toFamilyActivity(makeClaim({ status: 'rejected' }));
  assert.equal(rejected.status, 'declined');
  assert.deepEqual(rejected.availableActions, []);
});

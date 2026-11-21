import assert from 'node:assert/strict';
import test from 'node:test';

import { selectNeedsAttention } from '@/domain/needsAttention';

const ADULT = 'adult-1';

const input = {
  tasks: [
    { status: 'needs_attention' as const, assigneeId: 'kid-1' },
    { status: 'needs_attention' as const, assigneeId: ADULT },  // own — excluded
    { status: 'open' as const, assigneeId: 'kid-1' },
  ],
  contributionClaims: [
    { status: 'pending' as const, claimedByProfileId: 'kid-1' },
    { status: 'pending' as const, claimedByProfileId: ADULT },  // own — excluded
    { status: 'approved' as const, claimedByProfileId: 'kid-2' },
  ],
  rewardRedemptions: [
    { status: 'pending' as const, requestedByProfileId: 'kid-1' },
    { status: 'pending' as const, requestedByProfileId: 'kid-2' },
    { status: 'cancelled' as const, requestedByProfileId: 'kid-2' },
  ],
};

test('aggregates pending review items for a reviewer, excluding own items', () => {
  assert.deepEqual(selectNeedsAttention({ viewer: { id: ADULT, canReview: true }, ...input }), {
    taskReviews: 1, helpfulClaims: 1, rewardRequests: 2, total: 4,
  });
});

test('non-reviewer gets all zeros', () => {
  assert.deepEqual(selectNeedsAttention({ viewer: { id: 'kid-1', canReview: false }, ...input }), {
    taskReviews: 0, helpfulClaims: 0, rewardRequests: 0, total: 0,
  });
});

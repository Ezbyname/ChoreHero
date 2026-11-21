// Needs Attention — adult-side aggregation of items waiting for a review
// decision. Pure, frontend-derived, counts only; no navigation or
// mutation. Node-test safe.
//
// Mirrors the existing review rules:
//   - task reviews: tasks.status = 'needs_attention' (one pending submission
//     per task), excluding the viewer's own task;
//   - helpful claims: pending, excluding the viewer's own claim (a claimant
//     never reviews their own — also enforced by RLS);
//   - reward requests: pending, excluding the viewer's own request.
// A viewer without review permission gets all zeros.

import type { ContributionClaim, RewardRedemption, Task } from '@/types';

export interface NeedsAttentionCounts {
  taskReviews:     number;
  helpfulClaims:   number;
  rewardRequests:  number;
  total:           number;
}

export function selectNeedsAttention(input: {
  viewer:             { id: string; canReview: boolean };
  tasks:              readonly Pick<Task, 'status' | 'assigneeId'>[];
  contributionClaims: readonly Pick<ContributionClaim, 'status' | 'claimedByProfileId'>[];
  rewardRedemptions:  readonly Pick<RewardRedemption, 'status' | 'requestedByProfileId'>[];
}): NeedsAttentionCounts {
  const { viewer } = input;
  if (!viewer.canReview) return { taskReviews: 0, helpfulClaims: 0, rewardRequests: 0, total: 0 };

  const taskReviews = input.tasks.filter(
    (t) => t.status === 'needs_attention' && t.assigneeId !== viewer.id,
  ).length;
  const helpfulClaims = input.contributionClaims.filter(
    (c) => c.status === 'pending' && c.claimedByProfileId !== viewer.id,
  ).length;
  const rewardRequests = input.rewardRedemptions.filter(
    (r) => r.status === 'pending' && r.requestedByProfileId !== viewer.id,
  ).length;

  return { taskReviews, helpfulClaims, rewardRequests, total: taskReviews + helpfulClaims + rewardRequests };
}

// Suggested Next Reward — a SYSTEM suggestion: the aspirational next
// target. It is not a child-chosen goal ("Saving For" is intentionally not
// introduced) and it never duplicates "Ready to get" (affordable rewards).
// Pure, node-test safe.
//
// Points: the caller passes the viewer's AVAILABLE points, i.e.
// computeMyPointsSummary(...).available — the same reservation-aware
// semantics RewardsScreen uses.
//
// Rule (owner-approved):
//   1. Active rewards only.
//   2. Exclude rewards this child already has a pending request for.
//   3. Only rewards with requiredPoints GREATER than availablePoints.
//   4. Pick the closest / cheapest one: lowest requiredPoints, then title
//      (ordinal), then id (ordinal).
//   If every eligible reward is already affordable (or none exist), there
//   is no suggestion — affordable rewards belong in "Ready to get".

import type { Reward, RewardRedemption } from '@/types';

export type SuggestedReward =
  | { kind: 'suggested'; reward: Reward; pointsRemaining: number }
  | { kind: 'none' };

function compareOrdinal(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function selectSuggestedReward(input: {
  rewards:         readonly Reward[];
  redemptions:     readonly Pick<RewardRedemption, 'rewardId' | 'requestedByProfileId' | 'status'>[];
  viewerId:        string;
  availablePoints: number;
}): SuggestedReward {
  const { rewards, redemptions, viewerId, availablePoints } = input;

  const pendingRewardIds = new Set(
    redemptions
      .filter((r) => r.requestedByProfileId === viewerId && r.status === 'pending')
      .map((r) => r.rewardId),
  );

  const candidates = rewards
    .filter((r) => r.isActive && !pendingRewardIds.has(r.id) && r.requiredPoints > availablePoints)
    .sort((a, b) =>
      (a.requiredPoints - b.requiredPoints) ||
      compareOrdinal(a.title, b.title) ||
      compareOrdinal(a.id, b.id));

  if (candidates.length === 0) return { kind: 'none' };
  const reward = candidates[0];
  return { kind: 'suggested', reward, pointsRemaining: reward.requiredPoints - availablePoints };
}

// Slice 6C: Adult Rewards (Board 10 "Adult Rewards Final", Board 14 adult
// tokens). Pure and Node-test safe: no React, no react-native.
//
// MANAGEMENT, NOT A SHOP. A compact list in Board 10's order:
//   header (Rewards + New reward) → Requests → Rewards.
//
// Requests: the pending reward requests this adult may review. They come
// from buildNeedsAttention, the exact rule Adult Home and the AdultReview
// route use (reward_redemptions.status = 'pending', only with
// rewards.approve_redemption, archived rewards still reviewable —
// Decision 7). So a row here always opens in AdultReview, and a resolved
// or not-permitted request never shows. The action is the one word
// "Review"; the decision buttons live in the existing review flow.
// Order: the store's order, as on Home (no fairness rule is changed).
//
// Rewards: the household's ACTIVE rewards, exactly the set the old adult
// Rewards screen listed (archived rewards were never listed there and
// there is no archive UI). Order: the locked A2 contract,
// sortRewardsForDisplay (Points ASC → title ASC → id ASC). Each row shows
// the real name, the optional description, the cost (the only gold) and a
// state that is always a word plus an icon:
//   - Active:  an active reward with no request waiting.
//   - Request: an active reward with ≥ 1 pending request this adult can
//              review — the same count the Requests section shows — plus
//              "{n} request(s) waiting".
// No child Points, held / free Points, balances, rankings, progress bars,
// prize art or "Suggested" — those are the child screen's.

import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { buildNeedsAttention } from '@/features/adultHome/adultHomeModel';
import { sortRewardsForDisplay } from '@/features/rewards/sortRewards';
import type { HouseholdMember, Reward, RewardRedemption } from '@/types';

export type AdultRewardsPermissions = {
  canReviewRewards: boolean; // rewards.approve_redemption
  canCreateRewards: boolean; // rewards.create
};

export type AdultRewardsInput = {
  rewards:     readonly Reward[];
  redemptions: readonly RewardRedemption[];
  members:     readonly HouseholdMember[];
  viewerId:    string | null;
  permissions: AdultRewardsPermissions;
};

export type RewardRequestRow = {
  // The redemption id; the AdultReview route takes it.
  id:           string;
  rewardId:     string;
  childId:      string | null;
  childName:    string;
  rewardTitle:  string;
  points:       number;
  // "Reward request · Noam · 60 pts"
  subtitle:     string;
  // Always "Review".
  cta:          string;
  a11yLabel:    string;
  ctaA11yLabel: string;
  ctaA11yHint:  string;
};

export type RewardState = 'active' | 'request';

export type RewardRow = {
  reward:        Reward;
  title:         string;
  description:   string | null;
  // The cost, as a bare number for the gold pill.
  pointsLabel:   string;
  pendingCount:  number;
  // "1 request waiting" / "2 requests waiting"; null when none.
  pendingLabel:  string | null;
  state:         RewardState;
  stateLabel:    string;
  a11yLabel:     string;
};

export type AdultRewardsModel = {
  requests:  { rows: RewardRequestRow[]; count: number; visible: boolean; a11yLabel: string };
  rewards:   { rows: RewardRow[]; count: number; a11yLabel: string };
  canCreate: boolean;
};

export function buildRequestRows(input: AdultRewardsInput): RewardRequestRow[] {
  if (!input.permissions.canReviewRewards) return [];
  const items = buildNeedsAttention({
    tasks:           [],
    taskSubmissions: [],
    claims:          [],
    rewards:         input.rewards,
    redemptions:     input.redemptions,
    members:         input.members,
    viewerId:        input.viewerId,
    permissions: {
      canReviewMissions:      false,
      canReviewRewards:       true,
      canReviewContributions: false,
      canCreateMissions:      false,
      canCreateRewards:       false,
    },
    now:      new Date(0),
    timeZone: 'UTC',
  });
  const byId = new Map(input.redemptions.map((r) => [r.id, r]));
  return items.flatMap((item) => {
    const r = byId.get(item.id);
    if (!r) return [];
    const subtitle = formatCopy(copy.adultRewards.requestSubtitle, { name: item.childName, n: r.pointsRequiredSnapshot });
    return [{
      id:           r.id,
      rewardId:     r.rewardId,
      childId:      item.childId,
      childName:    item.childName,
      rewardTitle:  item.title,
      points:       r.pointsRequiredSnapshot,
      subtitle,
      cta:          copy.adultRewards.review,
      a11yLabel:    `${item.title}. ${subtitle}`,
      ctaA11yLabel: formatCopy(copy.adultRewards.reviewA11y, { title: item.title, name: item.childName }),
      ctaA11yHint:  copy.adultRewards.reviewHint,
    }];
  });
}

export function pendingLabel(n: number): string | null {
  if (n <= 0) return null;
  return formatCopy(n === 1 ? copy.adultRewards.pendingOne : copy.adultRewards.pendingMany, { n });
}

export function buildRewardRows(input: AdultRewardsInput, requests: readonly RewardRequestRow[]): RewardRow[] {
  const pendingByReward = new Map<string, number>();
  for (const r of requests) pendingByReward.set(r.rewardId, (pendingByReward.get(r.rewardId) ?? 0) + 1);
  return sortRewardsForDisplay(input.rewards.filter((r) => r.isActive)).map((reward) => {
    const pendingCount = pendingByReward.get(reward.id) ?? 0;
    const state: RewardState = pendingCount > 0 ? 'request' : 'active';
    const stateLabel = copy.adultRewards.state[state];
    const description = reward.description?.trim() ? reward.description.trim() : null;
    const waiting = pendingLabel(pendingCount);
    return {
      reward,
      title:        reward.title,
      description,
      pointsLabel:  String(reward.requiredPoints),
      pendingCount,
      pendingLabel: waiting,
      state,
      stateLabel,
      a11yLabel: [
        reward.title,
        description,
        formatCopy(copy.adultRewards.costA11y, { n: reward.requiredPoints }),
        stateLabel,
        waiting,
      ].filter(Boolean).join('. '),
    };
  });
}

export function buildAdultRewardsModel(input: AdultRewardsInput): AdultRewardsModel {
  const requestRows = buildRequestRows(input);
  const rewardRows  = buildRewardRows(input, requestRows);
  return {
    requests: {
      rows:      requestRows,
      count:     requestRows.length,
      // Only an adult who may review sees the section at all.
      visible:   input.permissions.canReviewRewards,
      a11yLabel: formatCopy(copy.adultRewards.requestsHeading, { n: requestRows.length }),
    },
    rewards: {
      rows:      rewardRows,
      count:     rewardRows.length,
      a11yLabel: formatCopy(copy.adultRewards.rewardsHeading, { n: rewardRows.length }),
    },
    canCreate: input.permissions.canCreateRewards,
  };
}

// ── Layout (Board 10 / 15 / 16) ─────────────────────────────────────────────
// A larger font behaves like a narrower phone. Below this effective width
// Review goes full width under the row text (Board 16), as on Adult Home
// and Adult Tasks.
export const REQUEST_ACTION_INLINE_MIN_WIDTH = 340;
export function requestActionFullWidth(windowWidth: number, fontScale: number): boolean {
  return windowWidth / Math.max(1, fontScale) < REQUEST_ACTION_INLINE_MIN_WIDTH;
}

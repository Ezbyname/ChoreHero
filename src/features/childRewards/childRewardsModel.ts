// Slice 5D: Child Rewards (Board 04 "Child Rewards Final"). Pure, node-test
// safe. Composes the existing rewards rules, nothing new:
//   - Wallet: computeMyPointsSummary + selectReservedPendingSnapshots (the
//     reservation model the request RPC uses). free = gross - held.
//     A legacy pending row holds nothing, exactly as on the server.
//   - Suggested next reward: selectSuggestedReward (owner-approved rule).
//   - Ordering: sortRewardsForDisplay (Points, then title, then id).
//   - Request availability: isRedemptionRequestAvailable's balance rule
//     (cost <= free Points).
// Only the viewer's own redemptions are ever read: no sibling Points,
// requests or collection, and no family ranking.

import { computeMyPointsSummary, selectReservedPendingSnapshots } from '@/features/rewards/pointsSummary';
import { sortRewardsForDisplay } from '@/features/rewards/sortRewards';
import { selectSuggestedReward } from '@/features/rewards/suggestedReward';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import type { Reward, RewardRedemption } from '@/types';

export type ChildRewardsInput = {
  rewards:      readonly Reward[];
  redemptions:  readonly RewardRedemption[];
  viewerId:     string;
  // The viewer's own gross balance; an absent balance row reads as 0
  // (the repo-wide convention, never a fabricated value).
  grossBalance: number;
};

export type RewardWallet = {
  total: number;   // gross balance
  held:  number;   // reserved by this child's own pending requests
  free:  number;   // total - held: what "Ask for it" can spend
};

export type ReadyReward     = { reward: Reward; cost: number };
export type KeepGoingReward = { reward: Reward; cost: number; toGo: number; progress: number };
export type AskedReward     = { redemption: RewardRedemption; reward: Reward | null; held: number };
export type CollectedReward = { reward: Reward; count: number; lastAt: string };

export type ChildRewardsModel = {
  wallet:     RewardWallet;
  suggested:  KeepGoingReward | null;
  ready:      ReadyReward[];
  keepGoing:  KeepGoingReward[];
  asked:      AskedReward[];
  collection: CollectedReward[];
  // True when the household has no active reward at all.
  noRewards:  boolean;
};

// Progress toward a reward the child can't ask for yet, 0..1.
export function rewardProgress(free: number, cost: number): number {
  return cost > 0 ? Math.max(0, Math.min(1, free / cost)) : 0;
}

const byOrdinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildChildRewardsModel(input: ChildRewardsInput): ChildRewardsModel {
  const { rewards, redemptions, viewerId, grossBalance } = input;
  const mine = redemptions.filter((r) => r.requestedByProfileId === viewerId);
  const rewardById = new Map(rewards.map((r) => [r.id, r]));

  const { available: free, pending: held } = computeMyPointsSummary(
    grossBalance,
    selectReservedPendingSnapshots(mine, viewerId),
  );
  const wallet: RewardWallet = { total: grossBalance, held, free };

  // Asked: every own pending request, legacy included (it still blocks a
  // second request), oldest first. A legacy row holds no Points.
  const pending = mine
    .filter((r) => r.status === 'pending')
    .sort((a, b) => byOrdinal(a.requestedAt, b.requestedAt) || byOrdinal(a.id, b.id));
  const pendingRewardIds = new Set(pending.map((r) => r.rewardId));
  const asked: AskedReward[] = pending.map((redemption) => ({
    redemption,
    reward: rewardById.get(redemption.rewardId) ?? null,
    held:   redemption.reservationModel === 'reserved' ? redemption.pointsRequiredSnapshot : 0,
  }));

  const pick = selectSuggestedReward({ rewards, redemptions: mine, viewerId, availablePoints: free });
  const toKeepGoing = (reward: Reward): KeepGoingReward => ({
    reward,
    cost:     reward.requiredPoints,
    toGo:     reward.requiredPoints - free,
    progress: rewardProgress(free, reward.requiredPoints),
  });
  const suggested = pick.kind === 'suggested' ? toKeepGoing(pick.reward) : null;

  const requestable = sortRewardsForDisplay(rewards.filter((r) => r.isActive && !pendingRewardIds.has(r.id)));
  const ready = requestable
    .filter((r) => r.requiredPoints <= free)
    .map((reward) => ({ reward, cost: reward.requiredPoints }));
  // The Suggested reward has its own card above, so it isn't repeated here.
  const keepGoing = requestable
    .filter((r) => r.requiredPoints > free && r.id !== suggested?.reward.id)
    .map(toKeepGoing);

  // My collection: rewards a grown-up approved for this child, one entry
  // per reward with how many times, most recent first. A reward that is
  // no longer in the store can't be named, so it isn't shown.
  const collected = new Map<string, CollectedReward>();
  for (const r of mine) {
    if (r.status !== 'approved') continue;
    const reward = rewardById.get(r.rewardId);
    if (!reward) continue;
    const at = r.reviewedAt ?? r.updatedAt;
    const prev = collected.get(reward.id);
    if (!prev) collected.set(reward.id, { reward, count: 1, lastAt: at });
    else collected.set(reward.id, { reward, count: prev.count + 1, lastAt: at > prev.lastAt ? at : prev.lastAt });
  }
  const collection = [...collected.values()]
    .sort((a, b) => byOrdinal(b.lastAt, a.lastAt) || byOrdinal(a.reward.id, b.reward.id));

  return {
    wallet,
    suggested,
    ready,
    keepGoing,
    asked,
    collection,
    noRewards: !rewards.some((r) => r.isActive),
  };
}

// Wallet card text (Board 04): the big number is the TOTAL balance; the
// line under it splits it into held and free. With nothing on hold it
// still states the real free figure; with no Points at all there is no
// line (nothing to split, and no "all yours" claim over zero).
export type WalletDisplay = { big: number; line: string | null; a11y: string };

export function walletDisplay(wallet: RewardWallet): WalletDisplay {
  const { total, held, free } = wallet;
  const base = formatCopy(copy.childRewards.walletA11y, { total });
  if (held > 0) {
    return {
      big:  total,
      line: formatCopy(copy.childRewards.walletBreakdown, { held, free }),
      a11y: `${base} ${formatCopy(copy.childRewards.walletHeldA11y, { held, free })}`,
    };
  }
  if (total > 0) {
    return {
      big:  total,
      line: formatCopy(copy.childRewards.walletNoHold, { free }),
      a11y: `${base} ${formatCopy(copy.childRewards.walletNoHoldA11y, { free })}`,
    };
  }
  return { big: total, line: null, a11y: base };
}

// Reward tiles sit two to a row, or one when the effective width is
// narrow (a 360dp phone, or any phone with a large font), so titles and
// "Ask for it · {points}" never squeeze.
export const MIN_TWO_COLUMN_WIDTH = 370;

export function rewardGridColumns(windowWidth: number, fontScale: number): 1 | 2 {
  return windowWidth / Math.max(1, fontScale) >= MIN_TWO_COLUMN_WIDTH ? 2 : 1;
}

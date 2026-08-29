import type { Reward } from '@/types';

// A2 — Reward Sorting. Pure, non-mutating — matches this codebase's
// established convention of keeping display/decision logic outside the
// screen component (see appBootstrapView.ts, rewardRequestUx.ts) so it is
// directly unit-testable without a component-render harness.
//
// Locked Product contract: requiredPoints ASC, then title ASC, then id ASC.
// Global and deterministic — intentionally does NOT take viewerBalance or
// any other per-viewer input; affordability is a display-state concern
// (RewardCard's canAfford badge), not an ordering concern.
//
// Title comparator: a plain ordinal `<`/`>` string comparison, not
// localeCompare(). ECMA-262's string relational operators compare UTF-16
// code units directly and are spec-guaranteed identical across every
// conformant engine; localeCompare()'s result depends on the engine's
// Intl/ICU locale data, which is not something to assume matches between
// the Web export's JS engine and Android's Hermes without positively
// verifying it — and this feature has no actual need for locale-aware
// (e.g. Hebrew) collation, so there is nothing to gain from that risk.
function compareTitlesOrdinal(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareRewardsForDisplay(a: Reward, b: Reward): number {
  if (a.requiredPoints !== b.requiredPoints) return a.requiredPoints - b.requiredPoints;

  const titleComparison = compareTitlesOrdinal(a.title, b.title);
  if (titleComparison !== 0) return titleComparison;

  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function sortRewardsForDisplay(rewards: Reward[]): Reward[] {
  return [...rewards].sort(compareRewardsForDisplay);
}

import { copy } from '@/content/copy';

// A3 — Confirm Before Redeem. Pure — kept in its own .ts file (not inline
// inside ConfirmRewardRequestModal.tsx) specifically so it's loadable by
// this repo's plain Node test runner, matching the established convention
// (see resolveInitialEmail.ts: Node's --experimental-strip-types loader
// rejects .tsx files outright, regardless of whether the specific export
// itself uses JSX).
export function formatConfirmRewardRequestBody(rewardTitle: string, requiredPoints: number): string {
  return copy.rewardRedemptionConfirm.bodyTemplate
    .replace('{title}', rewardTitle)
    .replace('{n}', String(requiredPoints));
}

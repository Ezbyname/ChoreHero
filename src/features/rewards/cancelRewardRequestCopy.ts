import { copy } from '@/content/copy';

// Reward Reserved Points — "Changed my mind". Pure, mirrors
// confirmRewardRequestCopy.ts's own rationale (Node's
// --experimental-strip-types loader rejects .tsx files outright, so this
// stays out of CancelRewardRequestModal.tsx).
export function formatCancelRewardRequestBody(pendingPoints: number): string {
  return copy.rewardCancelConfirm.bodyTemplate.replace('{n}', String(pendingPoints));
}

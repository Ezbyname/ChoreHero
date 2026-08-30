import type { RewardRedemption } from '@/types';

// Reward Reserved Points. Pure — kept in its own .ts file (not inline in
// RewardsScreen.tsx) so it's directly testable, matching this repo's
// established convention.
//
// Reservation is derived, never independently stored: "pending" is the
// sum of the viewer's own currently-PENDING redemptions'
// pointsRequiredSnapshot values — the same authoritative snapshot the
// backend RPCs use (supabase/migrations/20260830010000_reward_redemption_reserved_points.sql).
// "Available" is gross balance minus that sum. This mirrors the backend's
// own reservation formula exactly so the client never disagrees with the
// server about what's spendable.
export interface PointsSummary {
  available: number;
  pending:   number;
}

export function computeMyPointsSummary(
  grossBalance:          number,
  myPendingSnapshots:    readonly number[],
): PointsSummary {
  const pending = myPendingSnapshots.reduce((sum, snapshot) => sum + snapshot, 0);
  return { available: grossBalance - pending, pending };
}

// Legacy compatibility. Only rows created under the NEW reservation
// model (reservationModel === 'reserved', set explicitly by
// request_reward_redemption) participate in the reservation sum fed into
// computeMyPointsSummary above. A PENDING row that predates this
// migration (reservationModel === 'legacy') is excluded here — mirrors
// the backend RPC's own reservation-sum filter exactly (see this
// function's own migration reference), so the client never shows a
// reduced Available balance for a request the server never actually
// reserved against. This is the caller-side half of the "no retroactive
// purchasing-power change" guarantee.
export function selectReservedPendingSnapshots(
  redemptions: readonly Pick<RewardRedemption, 'requestedByProfileId' | 'status' | 'reservationModel' | 'pointsRequiredSnapshot'>[],
  viewerId:    string,
): number[] {
  return redemptions
    .filter((r) => r.requestedByProfileId === viewerId && r.status === 'pending' && r.reservationModel === 'reserved')
    .map((r) => r.pointsRequiredSnapshot);
}

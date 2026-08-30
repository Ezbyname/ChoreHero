import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { cancelRewardRedemption as cancelRewardRedemptionRpc, getRewardRedemptionsForHousehold } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

// Dedicated ERRCODEs the RPC raises — see
// supabase/migrations/20260830010000_reward_redemption_reserved_points.sql.
// Every other RPC failure (including the RPC's own defense-in-depth
// 28000 for a caller who isn't the redemption's own requester) collapses
// to 'failed' — mirrors rejectRewardRedemption.ts's identical convention.
const NOT_FOUND_CODE   = 'CH012';
const NOT_PENDING_CODE = 'CH013';

export type CancelRewardRedemptionResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_own_redemption' | 'not_found' | 'not_pending' | 'failed' };

interface CancelRewardRedemptionInput {
  redemptionId:         string;
  householdId:          string;
  role:                 string | null;
  requestedByProfileId: string;
}

// Reward Reserved Points — "Changed my mind". Child self-service only: a
// child may cancel only their OWN still-PENDING redemption. Mirrors
// rejectRewardRedemption.ts's shape closely, but authorization is
// ownership-based (requestedByProfileId === the caller), not a
// household-role privilege — the RPC re-derives and enforces this
// server-side from auth.uid() regardless of what this function sends.
//
// rewards.cancel_redemption is held by every role (adult+ inherit it
// through CHILD_PERMISSIONS), so the permission string alone does not
// exclude an adult caller — the exact 'child' role check below is what
// actually enforces this, mirroring requestRewardRedemption.ts's identical
// permission-string-plus-exact-role pattern (see its own comment).
export async function cancelRewardRedemption(
  input: CancelRewardRedemptionInput,
): Promise<CancelRewardRedemptionResult> {
  if (!hasHouseholdPermission(input.role, 'rewards.cancel_redemption') || input.role !== 'child') {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    const { rewardRedemptions, setRewardRedemptions } = useAppStore.getState();

    const redemption = rewardRedemptions.find((r) => r.id === input.redemptionId);
    if (!redemption) return { ok: false, reason: 'not_found' };
    if (redemption.requestedByProfileId !== input.requestedByProfileId) {
      return { ok: false, reason: 'not_own_redemption' };
    }
    if (redemption.status !== 'pending') return { ok: false, reason: 'not_pending' };

    const now = new Date().toISOString();
    setRewardRedemptions(
      rewardRedemptions.map((r) =>
        r.id === input.redemptionId
          ? { ...r, status: 'cancelled' as const, updatedAt: now }
          : r,
      ),
    );
    return { ok: true };
  }

  const cancelled = await cancelRewardRedemptionRpc(input.redemptionId);

  if (cancelled.error) {
    switch (cancelled.error.code) {
      case NOT_FOUND_CODE:
        return { ok: false, reason: 'not_found' };
      case NOT_PENDING_CODE:
        // Mirrors rejectRewardRedemption.ts's identical handling: someone
        // else already resolved this redemption (e.g. an adult approved/
        // rejected it) — refresh so the UI drops the now-stale pending
        // card instead of continuing to offer "Changed my mind" for a
        // request that's already terminal. Best-effort: a refresh
        // failure here does not change the reported reason.
        {
          const refreshedOnStale = await getRewardRedemptionsForHousehold(input.householdId);
          if (!refreshedOnStale.error) {
            useAppStore.getState().setRewardRedemptionRows(refreshedOnStale.data);
          }
        }
        return { ok: false, reason: 'not_pending' };
      default:
        return { ok: false, reason: 'failed' };
    }
  }

  const refreshed = await getRewardRedemptionsForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setRewardRedemptionRows(refreshed.data);
  return { ok: true };
}

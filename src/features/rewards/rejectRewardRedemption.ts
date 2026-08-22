import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { rejectRewardRedemption as rejectRewardRedemptionRpc, getRewardRedemptionsForHousehold } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

// Dedicated ERRCODEs the RPC raises — see
// supabase/migrations/20260822010000_reward_redemption_rpcs.sql. Every
// other RPC failure (including the RPC's own defense-in-depth 28000 for
// wrong role) collapses to 'failed'.
const NOT_FOUND_CODE   = 'CH012';
const NOT_PENDING_CODE = 'CH013';

export type RejectRewardRedemptionResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_found' | 'not_pending' | 'failed' };

interface RejectRewardRedemptionInput {
  redemptionId:        string;
  householdId:         string;
  role:                string | null;
  reviewedByProfileId: string;
}

// Privileged (owner/admin/adult) review only — mirrors
// approveRewardRedemption.ts's own authorization rationale. No balance or
// ledger mutation on rejection.
export async function rejectRewardRedemption(
  input: RejectRewardRedemptionInput,
): Promise<RejectRewardRedemptionResult> {
  if (!hasHouseholdPermission(input.role, 'rewards.reject_redemption')) {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    const { rewardRedemptions, setRewardRedemptions } = useAppStore.getState();

    const redemption = rewardRedemptions.find((r) => r.id === input.redemptionId);
    if (!redemption) return { ok: false, reason: 'not_found' };
    if (redemption.status !== 'pending') return { ok: false, reason: 'not_pending' };

    const now = new Date().toISOString();
    setRewardRedemptions(
      rewardRedemptions.map((r) =>
        r.id === input.redemptionId
          ? { ...r, status: 'rejected' as const, reviewedByProfileId: input.reviewedByProfileId, reviewedAt: now, updatedAt: now }
          : r,
      ),
    );
    return { ok: true };
  }

  const rejected = await rejectRewardRedemptionRpc(input.redemptionId);

  if (rejected.error) {
    switch (rejected.error.code) {
      case NOT_FOUND_CODE:
        return { ok: false, reason: 'not_found' };
      case NOT_PENDING_CODE:
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

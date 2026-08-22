import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import {
  approveRewardRedemption as approveRewardRedemptionRpc,
  getPointsBalancesForHousehold,
  getRewardRedemptionsForHousehold,
} from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

// Dedicated ERRCODEs the RPC raises — see
// supabase/migrations/20260822010000_reward_redemption_rpcs.sql. Every
// other RPC failure (including the RPC's own defense-in-depth 28000 for
// wrong role) collapses to 'failed' — the client-side gate below is what
// actually surfaces 'not_authorized' in real-mode operation.
const NOT_FOUND_CODE            = 'CH012';
const NOT_PENDING_CODE          = 'CH013';
const REWARD_ARCHIVED_CODE      = 'CH007';
const INSUFFICIENT_BALANCE_CODE = 'CH009';

export type ApproveRewardRedemptionResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not_authorized' | 'not_found' | 'not_pending' | 'reward_archived' | 'insufficient_balance' | 'failed';
    };

interface ApproveRewardRedemptionInput {
  redemptionId:        string;
  householdId:         string;
  role:                string | null;
  reviewedByProfileId: string;
}

// Privileged (owner/admin/adult) review only (Decision 2: no
// self-redemption — a reviewer here is never the requester, since only a
// child can request per Decision 4, and rewards.approve_redemption is not
// granted to the child role).
export async function approveRewardRedemption(
  input: ApproveRewardRedemptionInput,
): Promise<ApproveRewardRedemptionResult> {
  if (!hasHouseholdPermission(input.role, 'rewards.approve_redemption')) {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    const { rewards, pointsBalances, setPointsBalances, rewardRedemptions, setRewardRedemptions } =
      useAppStore.getState();

    const redemption = rewardRedemptions.find((r) => r.id === input.redemptionId);
    if (!redemption) return { ok: false, reason: 'not_found' };
    if (redemption.status !== 'pending') return { ok: false, reason: 'not_pending' };

    const reward = rewards.find((rw) => rw.id === redemption.rewardId);
    if (reward && !reward.isActive) return { ok: false, reason: 'reward_archived' };

    const balanceEntry = pointsBalances.find(
      (pb) => pb.householdId === redemption.householdId && pb.userId === redemption.requestedByProfileId,
    );
    const balance = balanceEntry?.balance ?? 0;
    if (balance < redemption.pointsRequiredSnapshot) return { ok: false, reason: 'insufficient_balance' };

    setPointsBalances(
      pointsBalances.map((pb) =>
        pb === balanceEntry ? { ...pb, balance: pb.balance - redemption.pointsRequiredSnapshot } : pb,
      ),
    );

    const now = new Date().toISOString();
    setRewardRedemptions(
      rewardRedemptions.map((r) =>
        r.id === input.redemptionId
          ? { ...r, status: 'approved' as const, reviewedByProfileId: input.reviewedByProfileId, reviewedAt: now, updatedAt: now }
          : r,
      ),
    );
    return { ok: true };
  }

  const approved = await approveRewardRedemptionRpc(input.redemptionId);

  if (approved.error) {
    switch (approved.error.code) {
      case NOT_FOUND_CODE:
        return { ok: false, reason: 'not_found' };
      case NOT_PENDING_CODE:
        // Someone else already reviewed this redemption (or it moved for
        // any other reason) between this client's last fetch and this
        // call. Refresh so the UI's next render drops it from the
        // actionable queue instead of keeping a stale pending item —
        // same getRewardRedemptionsForHousehold + setRewardRedemptionRows
        // pair used on the success path below. Best-effort: a refresh
        // failure here does not change the reported reason.
        {
          const refreshedOnStale = await getRewardRedemptionsForHousehold(input.householdId);
          if (!refreshedOnStale.error) {
            useAppStore.getState().setRewardRedemptionRows(refreshedOnStale.data);
          }
        }
        return { ok: false, reason: 'not_pending' };
      case REWARD_ARCHIVED_CODE:
        return { ok: false, reason: 'reward_archived' };
      case INSUFFICIENT_BALANCE_CODE:
        return { ok: false, reason: 'insufficient_balance' };
      default:
        return { ok: false, reason: 'failed' };
    }
  }

  const refreshed = await getRewardRedemptionsForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };
  useAppStore.getState().setRewardRedemptionRows(refreshed.data);

  // Best-effort refresh — mirrors approveTaskCompletion.ts's identical
  // comment: the approval + balance deduction + ledger insert already
  // committed atomically server-side.
  const refreshedBalances = await getPointsBalancesForHousehold(input.householdId);
  if (!refreshedBalances.error) {
    useAppStore.getState().setPointsBalanceRows(refreshedBalances.data);
  }

  return { ok: true };
}

import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { requestRewardRedemption as requestRewardRedemptionRpc, getRewardRedemptionsForHousehold } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';
import type { RewardRedemption } from '@/types';

// Dedicated ERRCODEs the RPC raises — see
// supabase/migrations/20260822010000_reward_redemption_rpcs.sql. Every
// other RPC failure (including the RPC's own defense-in-depth 28000 for
// wrong role) collapses to 'failed' — the client-side gate below is what
// actually surfaces 'not_authorized' in real-mode operation, mirroring
// requestTaskCompletion.ts's identical convention.
const REWARD_NOT_FOUND_CODE  = 'CH006';
const REWARD_ARCHIVED_CODE   = 'CH007';
const INSUFFICIENT_BALANCE_CODE = 'CH008';
const IDEMPOTENCY_CONFLICT_CODE = 'CH010';
const DUPLICATE_PENDING_CODE = 'CH011';

export type RequestRewardRedemptionResult =
  | { ok: true; redemption: RewardRedemption }
  | {
      ok: false;
      reason:
        | 'not_authorized'
        | 'reward_not_found'
        | 'reward_archived'
        | 'insufficient_balance'
        | 'duplicate_pending'
        | 'idempotency_conflict'
        | 'failed';
    };

interface RequestRewardRedemptionInput {
  rewardId:        string;
  householdId:      string;
  requestedByProfileId: string;
  role:             string | null;
  // Client-generated, one per intentional user action (Decision 10) — the
  // caller (UI layer, not yet built) is responsible for generating and
  // reusing this value across automatic retries of the same tap. Never
  // generated inside this function, so a genuine network retry replays
  // the same key rather than silently minting a second one.
  clientRequestId: string;
}

// Child-only (Decision 4: requester = beneficiary = child, always).
// rewards.redeem alone does not distinguish this from a privileged
// action — this function additionally requires an exact 'child' role,
// mirroring requestTaskCompletion.ts's own permission-string-plus-exact-
// role pattern for a child-only submission.
export async function requestRewardRedemption(
  input: RequestRewardRedemptionInput,
): Promise<RequestRewardRedemptionResult> {
  if (!hasHouseholdPermission(input.role, 'rewards.request_redemption') || input.role !== 'child') {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    const { rewards, pointsBalances, rewardRedemptions, setRewardRedemptions } = useAppStore.getState();

    const existing = rewardRedemptions.find(
      (r) =>
        r.requestedByProfileId === input.requestedByProfileId &&
        r.clientRequestId === input.clientRequestId,
    );
    if (existing) {
      if (existing.rewardId === input.rewardId) {
        return { ok: true, redemption: existing };
      }
      return { ok: false, reason: 'idempotency_conflict' };
    }

    const reward = rewards.find((rw) => rw.id === input.rewardId);
    if (!reward) return { ok: false, reason: 'reward_not_found' };
    if (!reward.isActive) return { ok: false, reason: 'reward_archived' };

    const balance = pointsBalances.find(
      (pb) => pb.householdId === input.householdId && pb.userId === input.requestedByProfileId,
    )?.balance ?? 0;
    if (balance < reward.requiredPoints) return { ok: false, reason: 'insufficient_balance' };

    const duplicatePending = rewardRedemptions.some(
      (r) =>
        r.householdId === input.householdId &&
        r.rewardId === input.rewardId &&
        r.requestedByProfileId === input.requestedByProfileId &&
        r.status === 'pending',
    );
    if (duplicatePending) return { ok: false, reason: 'duplicate_pending' };

    const now = new Date().toISOString();
    const newRedemption: RewardRedemption = {
      id:                     `redemption-${Date.now()}`,
      householdId:            input.householdId,
      rewardId:               input.rewardId,
      requestedByProfileId:   input.requestedByProfileId,
      clientRequestId:        input.clientRequestId,
      pointsRequiredSnapshot: reward.requiredPoints,
      status:                 'pending',
      requestedAt:            now,
      createdAt:              now,
      updatedAt:              now,
    };
    setRewardRedemptions([newRedemption, ...rewardRedemptions]);
    return { ok: true, redemption: newRedemption };
  }

  const requested = await requestRewardRedemptionRpc(input.rewardId, input.clientRequestId);

  if (requested.error) {
    switch (requested.error.code) {
      case REWARD_NOT_FOUND_CODE:
        return { ok: false, reason: 'reward_not_found' };
      case REWARD_ARCHIVED_CODE:
        return { ok: false, reason: 'reward_archived' };
      case INSUFFICIENT_BALANCE_CODE:
        return { ok: false, reason: 'insufficient_balance' };
      case IDEMPOTENCY_CONFLICT_CODE:
        return { ok: false, reason: 'idempotency_conflict' };
      case DUPLICATE_PENDING_CODE:
        // The client's own pre-check (or fast-path idempotency lookup)
        // missed an existing pending redemption — most likely because this
        // client's rewardRedemptions slice was stale relative to the
        // server (RLS is the actual source of truth). Refresh so the UI's
        // next render reflects the real pending row instead of just an
        // error, without inventing new client-side state — same
        // getRewardRedemptionsForHousehold + setRewardRedemptionRows
        // pair used on the success path below. Best-effort: a refresh
        // failure here does not change the reported reason.
        {
          const refreshedOnConflict = await getRewardRedemptionsForHousehold(input.householdId);
          if (!refreshedOnConflict.error) {
            useAppStore.getState().setRewardRedemptionRows(refreshedOnConflict.data);
          }
        }
        return { ok: false, reason: 'duplicate_pending' };
      default:
        return { ok: false, reason: 'failed' };
    }
  }

  const refreshed = await getRewardRedemptionsForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setRewardRedemptionRows(refreshed.data);

  // Look up the mapped domain object from the store rather than
  // re-deriving the snake_case→camelCase mapping here — mapRewardRedemptionRow
  // in useAppStore.ts is the single source of truth for that mapping.
  const redemption = useAppStore.getState().rewardRedemptions.find((r) => r.id === requested.data.id);
  if (!redemption) return { ok: false, reason: 'failed' };

  return { ok: true, redemption };
}

import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import {
  getContributionClaimsForHousehold,
  getPendingContributionClaimForMember,
  insertContributionClaim,
} from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';
import type { ContributionClaim } from '@/types';

// Postgres unique_violation — raised by uq_contribution_claims_one_pending_per_member
// when a race allows two pending-claim inserts past the pre-check below.
const UNIQUE_VIOLATION = '23505';

export type ClaimContributionResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'invalid_input' | 'duplicate_pending' | 'failed' };

interface ClaimContributionInput {
  householdId:        string;
  claimedByProfileId: string;
  role:               string | null;
  title:              string;
  description?:       string;
  points?:            number;
}

// Bottom-up self-report: a member claims credit for something they say they
// completed. This does not award points — it only creates a pending claim.
// Points are awarded on approval (see approveContributionClaim).
export async function claimContribution(
  input: ClaimContributionInput,
): Promise<ClaimContributionResult> {
  if (!hasHouseholdPermission(input.role, 'contributions.claim_completed')) {
    return { ok: false, reason: 'not_authorized' };
  }

  const title = input.title.trim();
  if (!title) {
    return { ok: false, reason: 'invalid_input' };
  }

  if (!isSupabaseConfigured) {
    const { contributionClaims, setContributionClaims } = useAppStore.getState();
    const alreadyPending = contributionClaims.some(
      (c) =>
        c.householdId === input.householdId &&
        c.claimedByProfileId === input.claimedByProfileId &&
        c.status === 'pending',
    );
    if (alreadyPending) return { ok: false, reason: 'duplicate_pending' };

    const newClaim: ContributionClaim = {
      id:                 `claim-${Date.now()}`,
      householdId:        input.householdId,
      title,
      description:        input.description,
      points:             input.points ?? 0,
      status:             'pending',
      claimedByProfileId: input.claimedByProfileId,
      createdAt:          new Date().toISOString(),
    };
    setContributionClaims([newClaim, ...contributionClaims]);
    return { ok: true };
  }

  // Friendly pre-check. The DB partial unique index is the actual source of
  // truth (see race-condition handling below) — this only avoids a round
  // trip that would just bounce off it in the common case.
  const existingPending = await getPendingContributionClaimForMember(
    input.householdId,
    input.claimedByProfileId,
  );
  if (existingPending.error) return { ok: false, reason: 'failed' };
  if (existingPending.data) return { ok: false, reason: 'duplicate_pending' };

  const inserted = await insertContributionClaim({
    householdId:        input.householdId,
    title,
    description:        input.description,
    points:             input.points,
    claimedByProfileId: input.claimedByProfileId,
  });
  if (inserted.error) {
    if (inserted.error.code === UNIQUE_VIOLATION) {
      return { ok: false, reason: 'duplicate_pending' };
    }
    return { ok: false, reason: 'failed' };
  }

  const refreshed = await getContributionClaimsForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setContributionClaimRows(refreshed.data);
  return { ok: true };
}

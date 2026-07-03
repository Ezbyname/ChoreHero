import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { getContributionClaimsForHousehold, insertContributionClaim } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';
import type { ContributionClaim } from '@/types';

export type ClaimContributionResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'invalid_input' | 'failed' };

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

  const inserted = await insertContributionClaim({
    householdId:        input.householdId,
    title,
    description:        input.description,
    points:             input.points,
    claimedByProfileId: input.claimedByProfileId,
  });
  if (inserted.error) return { ok: false, reason: 'failed' };

  const refreshed = await getContributionClaimsForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setContributionClaimRows(refreshed.data);
  return { ok: true };
}

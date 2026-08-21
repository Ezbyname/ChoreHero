import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { getContributionClaimById, getContributionClaimsForHousehold, updateContributionClaimStatus } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

export type RejectContributionClaimResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_found' | 'not_pending' | 'self_review' | 'failed' };

interface RejectContributionClaimInput {
  claimId:             string;
  householdId:         string;
  role:                string | null;
  reviewedByProfileId: string;
}

// self_review: mirrors approveContributionClaim's own comment — a claimant
// must never review (approve OR reject) their own claim. See that file for
// the full rationale and the matching RLS enforcement.
export async function rejectContributionClaim(
  input: RejectContributionClaimInput,
): Promise<RejectContributionClaimResult> {
  if (!hasHouseholdPermission(input.role, 'contributions.reject_claim')) {
    return { ok: false, reason: 'not_authorized' };
  }

  if (!isSupabaseConfigured) {
    const { contributionClaims, setContributionClaims } = useAppStore.getState();
    const claim = contributionClaims.find((c) => c.id === input.claimId);
    if (!claim) return { ok: false, reason: 'not_found' };
    if (claim.status !== 'pending') return { ok: false, reason: 'not_pending' };
    if (claim.claimedByProfileId === input.reviewedByProfileId) return { ok: false, reason: 'self_review' };

    const now = new Date().toISOString();
    setContributionClaims(
      contributionClaims.map((c) =>
        c.id === input.claimId
          ? { ...c, status: 'rejected' as const, reviewedByProfileId: input.reviewedByProfileId, reviewedAt: now }
          : c,
      ),
    );
    return { ok: true };
  }

  const claim = await getContributionClaimById(input.claimId);
  if (claim.error) return { ok: false, reason: 'failed' };
  if (!claim.data) return { ok: false, reason: 'not_found' };
  if (claim.data.status !== 'pending') return { ok: false, reason: 'not_pending' };
  if (claim.data.claimed_by_profile_id === input.reviewedByProfileId) return { ok: false, reason: 'self_review' };

  const updated = await updateContributionClaimStatus(input.claimId, {
    status:              'rejected',
    reviewedByProfileId: input.reviewedByProfileId,
  });
  if (updated.error) return { ok: false, reason: 'failed' };

  const refreshed = await getContributionClaimsForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setContributionClaimRows(refreshed.data);
  return { ok: true };
}

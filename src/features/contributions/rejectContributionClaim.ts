import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { getContributionClaimsForHousehold, updateContributionClaimStatus } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

export type RejectContributionClaimResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_found' | 'not_pending' | 'failed' };

interface RejectContributionClaimInput {
  claimId:             string;
  householdId:         string;
  role:                string | null;
  reviewedByProfileId: string;
}

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

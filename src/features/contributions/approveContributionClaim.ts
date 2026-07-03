import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { getContributionClaimsForHousehold, updateContributionClaimStatus } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

export type ApproveContributionClaimResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_found' | 'not_pending' | 'failed' };

interface ApproveContributionClaimInput {
  claimId:             string;
  householdId:         string;
  role:                string | null;
  reviewedByProfileId: string;
}

// Claim ≠ Completion: approval marks the claim reviewed. Awarding points is
// deferred — points_balances changes only via a SECURITY DEFINER RPC (see
// types/supabase.ts), and that RPC does not exist yet. A future ticket owns
// wiring the actual point award; this only transitions claim status.
export async function approveContributionClaim(
  input: ApproveContributionClaimInput,
): Promise<ApproveContributionClaimResult> {
  if (!hasHouseholdPermission(input.role, 'contributions.approve_claim')) {
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
          ? { ...c, status: 'approved' as const, reviewedByProfileId: input.reviewedByProfileId, reviewedAt: now }
          : c,
      ),
    );
    return { ok: true };
  }

  const updated = await updateContributionClaimStatus(input.claimId, {
    status:              'approved',
    reviewedByProfileId: input.reviewedByProfileId,
  });
  if (updated.error) return { ok: false, reason: 'failed' };

  const refreshed = await getContributionClaimsForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setContributionClaimRows(refreshed.data);
  return { ok: true };
}

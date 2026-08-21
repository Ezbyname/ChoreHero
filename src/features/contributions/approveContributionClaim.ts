import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { getContributionClaimById, getContributionClaimsForHousehold, updateContributionClaimStatus } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

export type ApproveContributionClaimResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'not_found' | 'not_pending' | 'self_review' | 'failed' };

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
//
// self_review: a claimant must never be able to review their own claim,
// regardless of role — checked here (application layer) and also enforced
// at the RLS layer (see contribution_claims_update_review in
// supabase/migrations/20260704000000_contribution_claims_rls.sql, updated
// by 20260821000000_contribution_claims_self_review.sql), matching this
// repo's existing defense-in-depth convention (RLS is authoritative; this
// check exists so the client gets a specific, friendly reason instead of a
// raw RLS-denial "not found" — updateContributionClaimStatus would return
// zero rows for a self-review attempt once the RLS fix lands, which is
// indistinguishable from "not found" without this pre-check).
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
    if (claim.claimedByProfileId === input.reviewedByProfileId) return { ok: false, reason: 'self_review' };

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

  const claim = await getContributionClaimById(input.claimId);
  if (claim.error) return { ok: false, reason: 'failed' };
  if (!claim.data) return { ok: false, reason: 'not_found' };
  if (claim.data.status !== 'pending') return { ok: false, reason: 'not_pending' };
  if (claim.data.claimed_by_profile_id === input.reviewedByProfileId) return { ok: false, reason: 'self_review' };

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

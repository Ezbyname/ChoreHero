import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';
import type { ContributionClaim, ContributionClaimStatus } from '@/types';

const STATUS_MAP: Record<ContributionClaimStatus, FamilyActivity['status']> = {
  pending:  'pending',
  approved: 'completed',
  rejected: 'declined',
};

export const ContributionClaimAdapter = {
  toFamilyActivity(claim: ContributionClaim): FamilyActivity {
    const availableActions: ActivityAction[] =
      claim.status === 'pending' ? ['approve', 'decline'] : [];

    return {
      id:                 claim.id,
      kind:               'request',
      title:              claim.title,
      description:        claim.description,
      householdId:        claim.householdId,
      createdByProfileId: claim.claimedByProfileId,
      targetProfileId:    undefined, // approver is role-gated, not one specific member
      status:             STATUS_MAP[claim.status],
      dueAt:              undefined,
      points:             claim.points,
      requiresApproval:   true,
      availableActions,
    };
  },
};

// DB contribution_claim_status enum: pending | approved | rejected
export type ContributionClaimStatus = 'pending' | 'approved' | 'rejected';

export interface ContributionClaim {
  id:                   string;
  householdId:          string;
  title:                string;
  description?:         string;
  points:               number;
  status:               ContributionClaimStatus;
  claimedByProfileId:   string;
  reviewedByProfileId?: string;
  reviewedAt?:          string;
  note?:                string;
  createdAt:            string;
}

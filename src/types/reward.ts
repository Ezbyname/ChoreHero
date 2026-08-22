export interface Reward {
  id:              string;
  householdId:     string;
  title:           string;
  description?:    string;
  requiredPoints:  number;
  isActive:        boolean;
}

export type RewardRedemptionStatus = 'pending' | 'approved' | 'rejected';

// Matches supabase/migrations/20260822000000_reward_redemptions.sql's
// reward_redemptions table exactly. requestedByProfileId doubles as the
// beneficiary (Decision 4: requester = beneficiary = child, always).
export interface RewardRedemption {
  id:                     string;
  householdId:            string;
  rewardId:               string;
  requestedByProfileId:   string;
  clientRequestId:        string;
  pointsRequiredSnapshot: number;
  status:                 RewardRedemptionStatus;
  reviewedByProfileId?:   string;
  reviewedAt?:            string;
  requestedAt:            string;
  createdAt:              string;
  updatedAt:              string;
}

// totalEarned and totalRedeemed are not stored in points_balances (T1.4.4).
// They require summing point_transactions — deferred to a later ticket.
// Made optional so Supabase-hydrated rows can omit them without breaking UI.
export interface PointsBalance {
  userId:         string;
  householdId:    string;
  balance:        number;
  totalEarned?:   number;
  totalRedeemed?: number;
}

export interface Reward {
  id:              string;
  householdId:     string;
  title:           string;
  description?:    string;
  requiredPoints:  number;
  isActive:        boolean;
}

export type RewardRedemptionStatus = 'pending' | 'approved' | 'rejected';

export interface RewardRedemption {
  id:             string;
  rewardId:       string;
  userId:         string;
  householdId:    string;
  status:         RewardRedemptionStatus;
  requestedAt:    string;
  reviewedAt?:    string;
  reviewedBy?:    string;
  pointsDeducted?: number;
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

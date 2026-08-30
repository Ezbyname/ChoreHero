export interface Reward {
  id:              string;
  householdId:     string;
  title:           string;
  description?:    string;
  requiredPoints:  number;
  isActive:        boolean;
}

// 'cancelled' = child withdrew their own request ("Changed my mind").
// Distinct from 'rejected' (an adult declined it) — see
// supabase/migrations/20260830000000_reward_redemption_cancelled_status.sql.
export type RewardRedemptionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

// Matches supabase/migrations/20260822000000_reward_redemptions.sql's
// reward_redemptions table exactly. requestedByProfileId doubles as the
// beneficiary (Decision 4: requester = beneficiary = child, always).
// Reward Reserved Points — legacy compatibility discriminator. 'legacy' =
// this row predates reservation accounting (created under the old "no
// reservation at request time" contract) and must never be treated as a
// reservation. 'reserved' = created by the reservation-aware
// request_reward_redemption RPC and does participate in the Available/
// Pending reservation sum. See supabase/migrations/
// 20260830010000_reward_redemption_reserved_points.sql.
export type RewardRedemptionReservationModel = 'legacy' | 'reserved';

export interface RewardRedemption {
  id:                     string;
  householdId:            string;
  rewardId:               string;
  requestedByProfileId:   string;
  clientRequestId:        string;
  pointsRequiredSnapshot: number;
  status:                 RewardRedemptionStatus;
  reservationModel:       RewardRedemptionReservationModel;
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

export interface Reward {
  id: string;
  householdId: string;
  title: string;
  description?: string;
  requiredPoints: number;
  isActive: boolean;
}

export type RewardRedemptionStatus = 'pending' | 'approved' | 'rejected';

export interface RewardRedemption {
  id: string;
  rewardId: string;
  userId: string;
  householdId: string;
  status: RewardRedemptionStatus;
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  pointsDeducted?: number;
}

export interface PointsBalance {
  userId: string;
  householdId: string;
  balance: number;
  totalEarned: number;
  totalRedeemed: number;
}

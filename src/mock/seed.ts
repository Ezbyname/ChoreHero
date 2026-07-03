import { mockCurrentUser, mockCurrentUserId } from './user';
import { mockHousehold } from './household';
import { mockTasks } from './tasks';
import { mockRewards, mockPointsBalances } from './rewards';
import { mockContributionClaims } from './contributionClaims';
import type { AppUser, ContributionClaim, Household, PointsBalance, Reward, Task } from '@/types';

export interface MockSeed {
  currentUser:        AppUser;
  currentUserId:      string;
  household:          Household;
  tasks:              Task[];
  rewards:            Reward[];
  pointsBalances:     PointsBalance[];
  contributionClaims: ContributionClaim[];
}

export const mockSeed: MockSeed = {
  currentUser:        mockCurrentUser,
  currentUserId:      mockCurrentUserId,
  household:          mockHousehold,
  tasks:              mockTasks,
  rewards:            mockRewards,
  pointsBalances:     mockPointsBalances,
  contributionClaims: mockContributionClaims,
};

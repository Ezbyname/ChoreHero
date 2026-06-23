import { mockCurrentUser, mockCurrentUserId } from './user';
import { mockHousehold } from './household';
import { mockTasks } from './tasks';
import { mockRewards, mockPointsBalances } from './rewards';
import type { AppUser, Household, PointsBalance, Reward, Task } from '@/types';

export interface MockSeed {
  currentUser:    AppUser;
  currentUserId:  string;
  household:      Household;
  tasks:          Task[];
  rewards:        Reward[];
  pointsBalances: PointsBalance[];
}

export const mockSeed: MockSeed = {
  currentUser:    mockCurrentUser,
  currentUserId:  mockCurrentUserId,
  household:      mockHousehold,
  tasks:          mockTasks,
  rewards:        mockRewards,
  pointsBalances: mockPointsBalances,
};

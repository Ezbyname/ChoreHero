import type { PointsBalance, Reward } from '@/types';

// Future: add category field to Reward (e.g. 'screen_time' | 'food' | 'activity')
export const mockRewards: Reward[] = [
  {
    id:             'reward-1',
    householdId:    'household-1',
    title:          'Choose dessert tonight',
    description:    'Pick any dessert for the whole family.',
    requiredPoints: 20,
    isActive:       true,
  },
  {
    id:             'reward-2',
    householdId:    'household-1',
    title:          'Choose family movie',
    description:    'You pick what we watch on Friday night.',
    requiredPoints: 30,
    isActive:       true,
  },
  {
    id:             'reward-3',
    householdId:    'household-1',
    title:          'Extra screen time',
    description:    '30 extra minutes on any device.',
    requiredPoints: 25,
    isActive:       true,
  },
  {
    id:             'reward-4',
    householdId:    'household-1',
    title:          'Sleep in on Saturday',
    description:    'No morning chores this weekend.',
    requiredPoints: 40,
    isActive:       false,
  },
];

// Future: add rank/level to PointsBalance (e.g. 'helper' | 'hero' | 'champion')
export const mockPointsBalances: PointsBalance[] = [
  {
    userId:        'user-daniel',
    householdId:   'household-1',
    balance:       55,
    totalEarned:   80,
    totalRedeemed: 25,
  },
  {
    userId:        'user-maya',
    householdId:   'household-1',
    balance:       30,
    totalEarned:   30,
    totalRedeemed: 0,
  },
];

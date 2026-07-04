import type { ContributionClaim } from '@/types';
import { hoursFromNow, yesterdayAt } from './dates';

export const mockContributionClaims: ContributionClaim[] = [
  {
    id:                 'claim-1',
    householdId:        'household-1',
    title:              'Fed the dog before school',
    points:             5,
    status:             'pending',
    claimedByProfileId: 'user-daniel',
    createdAt:          hoursFromNow(-3),
  },
  {
    id:                 'claim-2',
    householdId:        'household-1',
    title:              'Helped Mom carry groceries in',
    points:             5,
    status:             'pending',
    claimedByProfileId: 'user-maya',
    createdAt:          hoursFromNow(-1),
  },
  {
    id:                  'claim-3',
    householdId:         'household-1',
    title:               'Watered the plants',
    points:              5,
    status:              'approved',
    claimedByProfileId:  'user-daniel',
    reviewedByProfileId: 'user-mom',
    reviewedAt:          yesterdayAt(9),
    createdAt:           yesterdayAt(8),
  },
];

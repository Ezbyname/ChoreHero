import type { Household } from '@/types';

export const mockHousehold: Household = {
  id:   'household-1',
  name: 'The Family',
  members: [
    {
      id:     'member-dad',
      userId: 'user-dad',
      name:   'Dad',
      role:   'owner',
    },
    {
      id:     'member-mom',
      userId: 'user-mom',
      name:   'Mom',
      role:   'admin',
    },
    {
      id:     'member-daniel',
      userId: 'user-daniel',
      name:   'Daniel',
      role:   'child',
    },
    {
      id:     'member-maya',
      userId: 'user-maya',
      name:   'Maya',
      role:   'child',
    },
  ],
};

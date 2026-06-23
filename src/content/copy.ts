export const copy = {
  screens: {
    today: {
      title:    'Today',
      subtitle: 'A calm look at what needs your attention today.',
    },
    myTasks: {
      title:    'My Tasks',
      subtitle: 'Things assigned to you, all in one gentle view.',
    },
    assigned: {
      title:    'Assigned',
      subtitle: 'A simple way to follow up on tasks you shared.',
    },
    rewards: {
      title:    'Rewards',
      subtitle: 'Points, rewards, and little wins.',
    },
    settings: {
      title:    'Settings',
      subtitle: 'Family, preferences, and app settings.',
    },
  },
  emptyStates: {
    today:         'Everything is clear for now.',
    myTasks:       'Nothing on your plate right now — nicely done.',
    assigned:      'You have not assigned anything yet.',
    rewards:       'No rewards yet. You can add some when you are ready.',
    notifications: 'All quiet. Everything is up to date.',
  },
  today: {
    summary:          'Here are a few things that may need attention today.',
    unassignedBanner: 'Some family tasks are waiting for someone to take them.',
  },
  myTasks: {
    summary: 'Here is everything currently on your plate.',
  },
  rewards: {
    familyPoints:     'Family points',
    availableRewards: 'Available rewards',
    pointsLabel:      'points',
    pointsNeeded:     '{n} points needed',
    availableNow:     'Available now',
    morePointsToGo:   '{n} more to go',
    memberHasPoints:  '{name} has {n} points',
    noRewards:        'No rewards yet. You can add some when you are ready.',
  },
  taskCard: {
    unassigned:     'Waiting for someone to take this',
    needsAttention: 'Needs attention',
    points:         'pts',
  },
  errors: {
    generic: 'Something did not work as expected. Want to try again?',
    network: 'Connection seems a little shaky. Check your internet and try again.',
  },
  upgrade: {
    gentleLimit:
      'You reached the Free plan limit. You can edit something existing or upgrade when it feels right.',
  },
} as const;

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
  settingsScreen: {
    householdSection: 'Your household',
    // Shown when hydrated but household is unexpectedly null (invariant guard).
    noHousehold:      'No household',
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
  contributionClaims: {
    reviewSectionTitle: 'Waiting for your approval',
    pendingBadge:        'Waiting for approval',
    approveButton:       'Approve',
    rejectButton:        'Not this time',
    claimSectionTitle:   'Did you do something helpful?',
    claimFieldPlaceholder: 'What did you do?',
    claimSubmitButton:   'Send for approval',
    claimSubmitting:     'Sending…',
    claimSuccess:        'Sent! Waiting for a grown-up to approve.',
    claimError:          'We couldn\'t send that. Please try again.',
    claimDuplicatePending: 'You already have something waiting for approval. Hang tight!',
  },
  auth: {
    // Welcome screen
    welcomeTitle:    'Welcome to ChoreHero',
    welcomeSubtitle: 'A calmer way to share family tasks.',
    welcomeBody:     'Your family tasks and rewards will appear here after sign in.',

    // Login screen
    loginTitle:    'Sign in',
    loginSubtitle: 'Welcome back to your family.',

    // Signup screen
    signupTitle:    'Create your account',
    signupSubtitle: 'Start setting up a calmer way to share family tasks.',

    // Shared field labels
    emailLabel:           'Email',
    emailPlaceholder:     'your@email.com',
    passwordLabel:        'Password',
    passwordPlaceholder:  '••••••••',
    confirmPasswordLabel: 'Confirm password',

    // Buttons / loading states
    signInButton:    'Sign in',
    signingIn:       'Signing in…',
    createAccount:   'Create account',
    creatingAccount: 'Creating account…',
    backToSignIn:    'Back to Sign in',

    // Cross-screen navigation links
    loginToSignup: 'New to ChoreHero? Create an account',
    signupToLogin: 'Already have an account? Sign in',

    // Validation errors
    emptyFieldsError: 'Please enter your email and password.',
    passwordMismatch: 'The passwords do not match yet.',

    // Auth errors (normalized — never show raw Supabase messages)
    loginError:  'We could not sign you in. Please check your email and password.',
    signupError: 'We could not create the account. Please check the details and try again.',

    // Signup email-confirmation success state
    signupCheckEmailTitle: 'Check your email',
    signupCheckEmail:      'We sent you a link to finish creating your account.',

    // Settings / logout
    account:     'Account',
    signedInAs:  'Signed in as',
    signOut:     'Sign out',
    signingOut:  'Signing out…',
    logoutError: 'We could not sign you out. Please try again.',
  },
  profileSetup: {
    title:            'Let\'s create your ChoreHero profile',
    body:             'This is the name your family will see inside ChoreHero.',
    fieldLabel:       'Display name',
    fieldPlaceholder: 'Your name',
    button:           'Create profile',
    buttonLoading:    'Creating your profile…',
    validationEmpty:  'Please enter a display name.',
    error:            'We couldn\'t create your profile. Please try again.',
  },
  householdSetup: {
    title:            'Create your family household',
    body:             'Give your household a name. Your family members can join after.',
    fieldLabel:       'Household name',
    fieldPlaceholder: 'Our family',
    button:           'Create household',
    buttonLoading:    'Creating your household…',
    validationEmpty:  'Please enter a household name.',
    error:            'We couldn\'t create your household. Please try again.',
  },
  householdJoin: {
    // Toggle labels shown on the no-household screen
    tabCreate:        'Create a household',
    tabJoin:          'Join a household',

    // Join form
    title:            'Join a family space',
    body:             'Enter the code shared by your household organizer.',
    fieldLabel:       'Household code',
    fieldPlaceholder: 'Paste code here',
    button:           'Join household',
    buttonLoading:    'Joining your family space…',
    validationEmpty:  'Please enter a household code.',
    // Shown for not-found, RLS failure, or any controlled join error.
    // Raw Supabase/SQL messages are never shown.
    error:            'We couldn\'t join that household. Please check the code and try again.',
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

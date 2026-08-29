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
  // QA-01 — Runtime Build Identification. Read-only diagnostics only —
  // see src/lib/runtimeBuildInfo.ts.
  about: {
    sectionTitle:      'About',
    versionLabel:      'Version',
    buildLabel:        'Build',
    environmentLabel:  'Environment',
    commitLabel:       'Commit',
    backendLabel:      'Backend',
    copyButton:        'Copy build info',
    copySuccess:       'Build info copied',
    copyFailure:       'Couldn\'t copy build info. Please try again.',
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
    // P2-D07
    showMore:       'Show more',
    showLess:       'Show less',
  },
  // User-facing labels for FamilyActivity.kind — never expose DB table names
  // (e.g. "contribution_claims") in UI copy.
  activityKinds: {
    task:     'Task',
    request:  'Family Request',
    event:    'Event',
    reminder: 'Reminder',
  },
  activityCard: {
    completeAction:      'Complete',
    claimAction:         'I\'ll do this',
    claimError:          'We couldn\'t claim that — please try again.',
    alreadyClaimed:      'Someone already took this one.',
    completeNotAllowed:  'You cannot complete this task directly.',
    completeNotOpen:     'This task isn\'t available to complete right now.',
    completeError:       'We couldn\'t complete that — please try again.',
    // Child completion request (EX-06) — distinct from the EX-05 keys
    // above: those are written for the privileged direct-completion
    // rejection; these cover the child's own request-for-review action.
    requestNotAllowed:   'You can only request completion for tasks assigned to you.',
    requestNotOpen:      'This task isn\'t available to request completion for right now.',
    requestError:        'We couldn\'t send that for review — please try again.',
  },
  taskReview: {
    // Parent approval/rejection of a child's completion request (EX-07) —
    // distinct copy from contributionClaims below, since these review a
    // different underlying record (tasks.status, not contribution_claims).
    reviewSectionTitle: 'Waiting for your review',
    approveError:        'We couldn\'t approve that — please try again.',
    rejectError:         'We couldn\'t send that back — please try again.',
    notPending:          'This task has already been reviewed.',
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
  rewardRedemption: {
    // Child-facing redemption request UX. Mirrors contributionClaims'
    // claim*/pending copy shape exactly.
    //
    // A3 — Confirm Before Redeem: "Request this reward" (not "Redeem"),
    // matching the locked Product semantics that pressing this only opens
    // a confirmation for a request — approval and any point deduction
    // happen later, never here.
    requestButton:       'Request this reward',
    pendingBadge:        'Waiting for approval',
    requestError:        'We couldn\'t send that. Please try again.',
    insufficientBalance: 'You don\'t have enough points for this yet.',
    rewardArchived:      'This reward is no longer available.',
    duplicatePending:    'You already have a request waiting for approval for this reward.',
    // Distinct from an ordinary failure: signals a request-identity
    // conflict (the same client_request_id was reused for a different
    // reward) rather than an everyday retryable error.
    idempotencyConflict: 'Something went wrong with that request. Please try again.',
  },
  // A3 — Confirm Before Redeem. The one-time confirmation shown before a
  // request is actually sent — see ConfirmRewardRequestModal.tsx.
  // bodyTemplate's {title}/{n} placeholders are filled in by
  // confirmRewardRequestCopy.ts's formatConfirmRewardRequestBody, mirroring
  // this file's existing inline `.replace('{n}', ...)` convention used
  // elsewhere (e.g. rewards.pointsNeeded), just centralized in one pure,
  // directly-testable function since two placeholders are involved here.
  rewardRedemptionConfirm: {
    title:       'Request this reward?',
    bodyTemplate: '{title} costs {n} points. An adult needs to approve your request. Your points won\'t be deducted until it\'s approved.',
    confirmCta:  'Send request',
    cancelCta:   'Cancel',
  },
  rewardReview: {
    // Adult/Admin/Owner redemption review UX (parent flow) — distinct
    // copy from contributionClaims/taskReview above, since these review a
    // different underlying record (reward_redemptions, not
    // contribution_claims or tasks.status).
    reviewSectionTitle: 'Reward requests waiting for you',
    archivedNotice:     'This reward is no longer offered. You can still decline this request.',
    notFound:            'That request is no longer available.',
    notPending:          'Someone already reviewed that request.',
    approveArchived:     'This reward is no longer offered, so it can\'t be approved. You can still decline it.',
    approveInsufficientBalance: 'This child no longer has enough points for this reward.',
    approveError:        'We couldn\'t approve that — please try again.',
    rejectError:         'We couldn\'t send that back — please try again.',
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

    // Forgot password (Login screen link + ForgotPasswordScreen)
    forgotPasswordLink:    'Forgot your password?',
    forgotPasswordTitle:   'Reset your password',
    forgotPasswordSubtitle: 'Enter your email and we\'ll send you a link to get back in.',
    forgotPasswordButton:  'Send reset link',
    sendingResetLink:      'Sending…',
    // Enumeration-safe: identical wording whether or not the email is
    // actually registered — never confirm or deny that.
    resetLinkSentTitle: 'Check your email',
    resetLinkSentBody:  'If that email is registered, we\'ve sent a link to reset your password.',
    // Genuine request errors only (rate-limited, network, malformed input)
    // — never shown for "email not registered", which resetPasswordForEmail
    // never distinguishes in the first place.
    resetLinkRequestError: 'We couldn\'t send the reset link. Please try again.',
    resetLinkRateLimited:  'Too many reset requests. Please wait a little and try again.',

    // Resend (shared by SignupScreen's and ForgotPasswordScreen's success states)
    resendEmailButton:    'Resend email',
    resendEmailCountdown: 'Resend in {n}s',

    // ResetPasswordScreen (landing from the recovery email link)
    resetPasswordTitle:      'Choose a new password',
    resetPasswordSubtitle:   'Enter and confirm your new password below.',
    newPasswordLabel:        'New password',
    confirmNewPasswordLabel: 'Confirm new password',
    resetPasswordButton:     'Update password',
    updatingPassword:        'Updating…',
    resetPasswordError:      'We couldn\'t update your password. Please try again.',
    passwordUpdatedTitle:    'Password updated',
    // Product Decision A (N1.3): a successful reset keeps the user's
    // recovery session — they're already signed in, not sent back to
    // Sign In — so this must not imply a further sign-in step is needed.
    passwordUpdatedBody:     'Your password has been updated.',
    continueToApp:           'Continue to ChoreHero',

    // Recovery link failure states (AppBootstrap routes here — see Task 4)
    recoveryLinkExpiredTitle: 'That link has expired',
    recoveryLinkExpiredBody:  'Password reset links only work for a little while. Request a new one below.',

    // Landing state after clicking the email confirmation link itself —
    // shown instead of booting the full app, since the real sign-in happens
    // on whichever device the user actually uses ChoreHero from.
    emailConfirmedTitle: 'Email confirmed!',
    emailConfirmedBody:  'You can close this page now and sign in from the app.',

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
    avatarLabel:        'Pick an avatar (optional)',
    uploadPhotoButton:  'Upload photo',
    changePhotoButton:  'Change photo',
    uploadPhotoError:   'We couldn\'t upload that photo. Please try again.',
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
    body:             'Enter the invite code shared by your household organizer.',
    fieldLabel:       'Invite code',
    fieldPlaceholder: 'e.g. AB3DEFGH',
    button:           'Join household',
    buttonLoading:    'Joining your family space…',
    validationEmpty:  'Please enter an invite code.',
    // Shown for not-found, expired, revoked, or any controlled redemption
    // error. Raw Supabase/SQL messages are never shown.
    error:            'We couldn\'t join with that code. Please check it and try again.',
  },
  householdInvites: {
    title:        'Invite family members',
    body:         'Generate a code and share it however you like — WhatsApp, text, in person.',
    roleLabels: {
      owner: 'Owner',
      admin: 'Admin',
      adult: 'Adult',
      child: 'Child',
    },
    createButton: 'Generate invite',
    createError:  'We couldn\'t create that invite. Please try again.',
    revokeButton: 'Revoke',
    revokeError:  'We couldn\'t revoke that invite. Please try again.',
    empty:        'No active invites yet.',
  },
  createTask: {
    title:            'Create a task',
    fieldPlaceholder: 'What needs to get done?',
    validationEmpty:  'Please enter a task title.',
    assigneeLabel:    'Assign to',
    openToAnyone:     'Open to anyone',
    pointsLabel:      'Points (optional)',
    pointsPlaceholder: '0',
    button:           'Create task',
    success:          'Task created.',
    error:            'We couldn\'t create that task. Please try again.',
    // P2-D01/P2-D02
    descriptionLabel:       'Description (optional)',
    descriptionPlaceholder: 'Add any helpful details',
    descriptionTooLong:     'Description can be at most 500 characters.',
    // P2-D03/P2-D05/P2-D10
    dueDateLabel:        'Due date (optional)',
    addDueDateButton:    'Add a due date',
    removeDueDateButton: 'Remove due date',
    addTimeButton:       'Add a time',
    removeTimeButton:    'Remove time',
    pastDueWarning:      'That date has already passed.',
    dueDateRecommendation: 'Adding a due date can help keep things on track.',
  },
  createReward: {
    title:               'Create a reward',
    fieldPlaceholder:    'What can points be redeemed for?',
    validationEmpty:     'Please enter a reward title.',
    descriptionLabel:       'Description (optional)',
    descriptionPlaceholder: 'Add any helpful details',
    pointsLabel:         'Points required',
    pointsPlaceholder:   '20',
    validationPoints:    'Points required must be a whole number greater than 0.',
    button:              'Create reward',
    success:             'Reward created.',
    error:               'We couldn\'t create that reward. Please try again.',
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

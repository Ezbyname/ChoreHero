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
    family: {
      title:    'Family',
      subtitle: 'Your household and the people in it.',
    },
  },
  // Slice 5A Child Home (Board 02). Plain words only: no XP, levels,
  // streaks or badges.
  childHome: {
    eyebrow:          'My ChoreHero',
    greeting:         'Hey, {name}!',
    leftToday:        '{n} missions left today',
    leftTodayOne:     '1 mission left today',
    nothingDueToday:  'Nothing due today',
    allDoneToday:     'All done today!',
    compactProgress:  '{done} / {total} done · {left} left today',
    pointsA11y:       '{n} points available',
    todaysMissions:   'Today’s missions',
    progressA11y:     '{done} of {total} missions done today',
    nextMission:      'Your next mission',
    ribbonReady:      'Ready',
    ribbonSentBack:   'Sent back',
    ribbonOpen:       'Open to anyone',
    ribbonOverdue:    'Overdue',
    pointsPill:       '+{n} pts',
    pointsPillShort:  '+{n}',
    ctaComplete:      'I did it!',
    ctaRetry:         'Try again',
    ctaClaim:         'I’ll do this',
    openToAnyone:     'Open to anyone',
    sentBack:         'Sent back · give it another go',
    waitingRow:       '{title} · waiting for a grown-up',
    waitingRowHint:   'Change photos or cancel',
    openMissionHint:  'Opens the mission so you can send it',
    waitingTitle:     'Waiting for a grown-up',
    waitingBody:      'You sent {n} missions. A grown-up will check them soon.',
    waitingBodyOne:   'You sent a mission. A grown-up will check it soon.',
    allDoneTitle:     'All done today!',
    allDoneBody:      'Great work, {name}.',
    emptyTitle:       'No missions yet',
    emptyBody:        'Ask a grown-up to add one.',
    alsoToday:        'Also today',
    suggestedReward:  'Suggested next reward',
    pointsToGo:       '{n} pts to go',
    familyToday:      'Our family today',
    familyCount:      '{done} / {total} missions',
    familyA11y:       'Your family has done {done} of {total} missions today',
  },
  // Slice 5B: Child Missions (Board 03).
  childMissions: {
    title:            'Missions',
    sectionsA11y:     'Mission lists',
    sectionTodo:      'To Do',
    sectionWaiting:   'Waiting',
    sectionDone:      'Done',
    sectionTabA11y:   '{label}, {n}',
    doThisFirst:      'Do this first',
    giveItAnotherGo:  'Give it another go',
    overdue:          'Overdue',
    openToAnyone:     'Open to anyone',
    waitingTitle:     'Waiting for a grown-up',
    waitingBody:      'Nice work! They will take a look soon.',
    // Locked Board 03 copy.
    waitingNote:      'You can still change your photos before a grown-up checks it.',
    changePhotos:     'Change photos',
    changePhotosHint: 'Opens your sent mission so you can change the photos',
    photosSent:       '{n} photos sent',
    photosSentOne:    '1 photo sent',
    noPhotosSent:     'Sent without photos',
    doneToday:        'Done today · {n}',
    doneEarlier:      'Earlier',
    doneRowA11y:      '{title}, done',
    doneRowPointsA11y: '{title}, done, {n} points',
    todoEmptyTitle:   'Nothing to do right now',
    todoEmptyBody:    'Ask a grown-up to add a mission.',
    waitingEmptyTitle: 'Nothing waiting',
    waitingEmptyBody:  'Missions you send to a grown-up show up here.',
    doneEmptyTitle:   'Nothing done yet',
    doneEmptyBody:    'Finished missions show up here.',
    openMissionA11y:  'Opens {title}',
  },
  // Slice 5C: Child Mission Details (Board 19).
  missionDetails: {
    title:          'Mission',
    back:           'Back',
    whatToDo:       'What to do',
    due:            'Due',
    askedBy:        'Asked by',
    points:         'Points',
    stateReady:     'To do',
    stateOverdue:   'Overdue',
    stateWaiting:   'Waiting for a grown-up',
    stateDone:      'Done',
    // No reviewer name or note: only that it came back.
    sentBackBanner: 'A grown-up asked for one more try. You can send it again.',
    doneBanner:     'You finished this mission.',
    photosSentAt:   '{photos} · {time}',
    missingTitle:   'This mission is not here any more',
    missingBody:    'It may have been finished or changed. Go back to see your missions.',
  },
  // Slice 5C: the child's Submit Evidence screen (Board 20). The flow, the
  // limits and the errors are the existing completion sheet's.
  childEvidence: {
    title:            'I did it!',
    photosTitle:      'Photos',
    photoCount:       '{n} of {max}',
    hint:             'Add up to {max} photos. You can also send without photos.',
    maxReached:       'That is the maximum, {max} photos. Remove one to add another.',
    submit:           'Send it in',
    sending:          'Sending…',
    sendingPhotos:    'Sending your photos…',
    photoSheetTitle:  'Photo {i}',
    changeCamera:     'New photo from Camera',
    changeGallery:    'New photo from Gallery',
    removePhoto:      'Remove this photo',
    cancel:           'Cancel',
    sentTitle:        'Sent!',
    sentBody:         'Waiting for a grown-up to take a look.',
    sentPill:         'Waiting',
    backToMissions:   'Back to missions',
  },
  // Slice 5D: Child Rewards (Board 04). Honest labels: the child asks and a
  // grown-up approves, so the action is "Ask for it", never Get or Buy.
  // Held Points are real: a pending request holds them, cancelling returns them.
  childRewards: {
    title:           'Rewards',
    walletTitle:     'Points wallet',
    // Board 04: the big number is the TOTAL; the line under it splits it.
    walletUnit:      'points',
    walletBreakdown: '{held} on hold · {free} free',
    walletNoHold:    'None on hold · {free} free',
    walletA11y:      '{total} points in all.',
    walletHeldA11y:  '{held} on hold for rewards you asked for, {free} free to use.',
    walletNoHoldA11y: 'All {free} free to use.',
    suggested:       'Suggested next reward',
    toGo:            '{n} to go',
    toGoA11y:        '{n} more points to go',
    readyTitle:      'Ready to get',
    keepGoingTitle:  'Keep going',
    askFor:          'Ask for it · {n}',
    askForA11y:      'Ask for {title}, {n} points',
    readyA11y:       '{title}. {n} points. You can ask for it now.',
    lockedA11y:      '{title}. {n} points. {toGo} more points to go.',
    askedTitle:      'Asked for',
    askedState:      'Waiting for a grown-up',
    askedHeld:       '{n} points on hold',
    askedA11y:       '{title}. Asked for, waiting for a grown-up.',
    unknownReward:   'A reward',
    changedMind:     'Changed my mind',
    changedMindA11y: 'Cancel your request for {title}',
    collectionTitle: 'My collection',
    collectionCount: '×{n}',
    collectionA11y:  '{title}, got it {n} times',
    collectionA11yOnce: '{title}, got it',
    collectionEmpty: 'Rewards you get will show up here.',
    noRewardsTitle:  'No rewards yet',
    noRewardsBody:   'A grown-up can add rewards. They will show up here.',
    nothingReady:    'Nothing to ask for yet. Keep going!',
  },
  // Slice 6A: Adult Home (Board 06). One decision word on Home: every
  // attention row's action is "Review"; the row names the kind of item.
  // No family progress metric, no Recent activity (owner decision D3),
  // and no child Points on this screen.
  adultHome: {
    greeting:        'Hi, {name}',
    greetingNoName:  'Hi there',
    subtitle:        'Family dashboard',
    needsAttention:  'Needs attention',
    attentionCountA11y: '{n} items need your review',
    attentionOneA11y:   '1 item needs your review',
    allClear:        'Nothing is waiting for your review.',
    rowHeading:      '{name} · {title}',
    types: {
      mission_review:       'Mission review',
      reward_request:       'Reward request',
      helpful_contribution: 'Helpful contribution',
    },
    photoOne:        '1 photo',
    photoMany:       '{n} photos',
    pointsMeta:      '{n} pts',
    review:          'Review',
    reviewA11y:      'Review: {name}, {title}',
    reviewHint:      'Opens the {type}',
    someone:         'Someone',
    quickActions:    'Quick actions',
    newMission:      'New mission',
    newMissionHint:  'Opens the form to create a mission',
    newReward:       'New reward',
    newRewardHint:   'Opens the form to create a reward',
    kidsToday:       'Kids today',
    progress:        '{done} of {total} missions done',
    progressA11y:    '{done} of {total} missions done today',
    noneDueToday:    'No missions due today',
    waiting:         '{n} waiting',
    waitingA11y:     '{n} waiting for your review',
    noKids:          'No children in the family yet.',
    reviewTitle:     'Review',
    reviewGone:      'This is no longer waiting for review.',
    backToHome:      'Back to Home',
  },
  // Slice 6B: Adult Tasks (Board 07). Segments Open · Waiting · Sent back ·
  // Done. "Waiting" is the same word as Review items on Home; the row
  // action for it is "Review". Sent back is indigo, never red. There is no
  // Edit or Archive.
  adultTasks: {
    title:          'Tasks',
    newLabel:       'New',
    newA11y:        'New mission',
    newHint:        'Opens the form to create a mission',
    segmentsA11y:   'Choose which tasks to show',
    segments: {
      open:      'Open',
      waiting:   'Waiting',
      sent_back: 'Sent back',
      done:      'Done',
    },
    segmentA11y:    '{label}, {n} tasks',
    segmentOneA11y: '{label}, 1 task',
    headings: {
      open:      'Open',
      waiting:   'Waiting for review',
      sent_back: 'Sent back',
      done:      'Done',
    },
    empty: {
      open:      'No open tasks right now.',
      waiting:   'Nothing is waiting for review.',
      sent_back: 'Nothing has been sent back.',
      done:      'No finished tasks yet.',
    },
    state: {
      waiting:  'Waiting',
      sentBack: 'Sent back',
      done:     'Done',
    },
    anyone:         'Anyone',
    noDue:          'No due date',
    pointsA11y:     '{n} points',
    review:         'Review',
    newMissionTitle: 'New mission',
  },
  // Slice 6D: Adult Family (Board 12). Household management only: profile,
  // members, invite, Settings. No Points, progress or rankings.
  adultFamily: {
    title:          'Family',
    profile:        'Profile',
    profileA11y:    'Profile',
    profileHint:    'Name, avatar and photo',
    profileLine:    '{role} · {household}',
    membersHeading: 'Members · {n}',
    inviteTitle:    'Invite someone',
    inviteCodeA11y: 'Invite code {code}, for {role}',
    inviteFor:      '{role} code',
    validOne:       'Valid for 1 more day',
    validMany:      'Valid for {n} more days',
    moreOne:        '1 more active code in Settings',
    moreMany:       '{n} more active codes in Settings',
    noInvite:       'No active invite code. Generate one in Settings.',
    inviteLoading:  'Loading invite code…',
    inviteError:    'The invite code can\'t load right now. Pull down to try again.',
    share:          'Share',
    shareA11y:      'Share invite code {code}',
    shareMessage:   'Join {household} on ChoreHero. Invite code: {code}',
    shareMessageNoName: 'Join our family on ChoreHero. Invite code: {code}',
    copied:         'Invite code copied.',
    shareFailed:    'We couldn\'t share the code. You can read it out or copy it from Settings.',
    settings:       'Settings',
    settingsHint:   'Profile, household, invites, about and sign out',
  },
  // Slice 6C: Adult Rewards (Board 10) + Create Reward (Board 11).
  // Management, not a shop: name, cost, state. Requests use "Review".
  adultRewards: {
    title:           'Rewards',
    newReward:       'New reward',
    newRewardHint:   'Opens the form to create a reward',
    requestsHeading: 'Requests · {n}',
    rewardsHeading:  'Rewards · {n}',
    requestSubtitle: 'Reward request · {name} · {n} pts',
    review:          'Review',
    reviewA11y:      'Review: {title}, {name}',
    reviewHint:      'Opens the reward request',
    noRequests:      'No reward requests waiting.',
    noRewards:       'No rewards yet.',
    noRewardsCreate: 'No rewards yet. Add one with New reward.',
    pendingOne:      '1 request waiting',
    pendingMany:     '{n} requests waiting',
    costA11y:        '{n} points',
    state: {
      active:  'Active',
      request: 'Request',
    },
    create: {
      title:            'New reward',
      nameLabel:        'Reward name',
      namePlaceholder:  'What can points be used for?',
      nameRequired:     'Please enter a reward name.',
      descriptionLabel: 'Description (optional)',
      descriptionPlaceholder: 'Add any helpful details',
      costLabel:        'Points cost',
      costPlaceholder:  '0',
      costA11y:         'Points cost',
      decrease:         'Decrease points cost',
      increase:         'Increase points cost',
      presetA11y:       'Set points cost to {n}',
      quickCostsA11y:   'Quick points costs',
      costErrors: {
        empty:     'Please enter a points cost.',
        not_whole: 'Points cost must be a whole number.',
        too_small: 'Points cost must be greater than 0.',
        too_large: 'That points cost is too large.',
      },
      button:   'Create reward',
      creating: 'Creating…',
      error:    'We couldn\'t create that reward. Please try again.',
      notAllowed: 'You can\'t create rewards in this household.',
    },
  },
  // Slice 4 role-based navigation. Tab labels are locked: the route name
  // equals the label (src/navigation/roleShell.ts TAB_LABELS).
  navigation: {
    openProfileA11y:      'Open your profile and settings',
    tasksViewAssigned:    'Assigned',
    tasksViewMine:        'My Tasks',
    tasksViewA11y:        'Choose which tasks to show',
    familyMembersSection: 'Family members',
    familySettingsLink:   'Settings',
    familySettingsHint:   'Profile, about, and sign out',
  },
  settingsScreen: {
    householdSection: 'Your household',
    // Shown when hydrated but household is unexpectedly null (invariant guard).
    noHousehold:      'No household',
    profileSection:   'Your profile',
    editProfile:      'Edit profile',
    editProfileHint:  'Name, avatar and photo',
    sessionSection:   'Session',
    signOutConfirmTitle: 'Sign out of ChoreHero?',
    signOutConfirmBody:  'You can sign back in any time with your email and password.',
    signOutConfirm:      'Sign out',
    signOutCancel:       'Stay signed in',
  },
  // Settings -> Edit profile (the onboarding ProfileSetupScreen stays
  // onboarding-only; this is the everyday edit path ROADMAP.md planned).
  profileEdit: {
    title:          'Edit profile',
    nameLabel:      'Your name',
    namePlaceholder: 'What should your family call you?',
    nameRequired:   'Please enter a name.',
    avatarLabel:    'Avatar',
    photoLabel:     'Profile photo',
    choosePhoto:    'Choose a photo',
    changePhoto:    'Change photo',
    removePhoto:    'Remove photo',
    uploadingPhoto: 'Uploading photo…',
    photoFailed:    'We couldn\'t upload that photo. Try another one.',
    save:           'Save',
    saving:         'Saving…',
    saved:          'Profile saved.',
    saveFailed:     'We couldn\'t save your profile. Please try again.',
    close:          'Close',
  },
  // QA-01 — Runtime Build Identification. Read-only diagnostics only —
  // see src/lib/runtimeBuildInfo.ts.
  // QA-variant builds only (Settings) — what the live sync is doing, so a
  // device QA run can show why a screen is stale. Never in Production.
  syncDiagnostics: {
    sectionTitle: 'Sync diagnostics (QA)',
    hint:         'Live updates and background refreshes on this device. Pull down on a list to refresh it.',
  },
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
    tasksSectionTitle: 'Today\'s tasks',
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
    // Reward Reserved Points — the viewing child's own Available/Pending
    // summary. "Available" is spendable now; "Pending" is reserved by
    // their own currently-PENDING requests, not yet permanently spent.
    myPointsAvailable: '{n} points available',
    myPointsPending:   '{n} points pending',
    noPointsYet:       'No points yet — finished tasks will show up here.',
    // Labels under the big numbers on a child's own points summary.
    myPointsAvailableLabel: 'Points available',
    myPointsPendingLabel:   'Waiting on requests',
  },
  taskCard: {
    unassigned:     'Waiting for someone to take this',
    needsAttention: 'Needs attention',
    waitingForReview: 'Waiting for review',
    // Reviewer card evidence badge — metadata only, no image bytes.
    photoCountA11y:   '{n} photos attached',
    photoCountOneA11y: '1 photo attached',
    noPhotoA11y:      'No photo attached',
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
    // Child's own waiting-for-review card: opens the pending sheet.
    manageCompletionAction: 'Change or cancel',
  },
  taskReview: {
    // Parent approval/rejection of a child's completion request (EX-07) —
    // distinct copy from contributionClaims below, since these review a
    // different underlying record (tasks.status, not contribution_claims).
    reviewSectionTitle: 'Waiting for your review',
    approveError:        'We couldn\'t approve that — please try again.',
    rejectError:         'We couldn\'t send that back — please try again.',
    notPending:          'This task has already been reviewed.',
    // Reviewer evidence Modal — child-facing-safe strings only. Raw backend
    // codes, Storage paths, HTTP statuses, and CH-codes are never surfaced.
    title:               'Review completion',
    loadingContext:      'Looking up this completion…',
    loadingPhoto:        'Loading the photo…',
    noPhotoAttached:     'No photo attached.',
    evidenceFailed:      'We couldn\'t load the photo. Try again.',
    retry:               'Try again',
    confirmApprove:      'Approve',
    confirmReject:       'Send back',
    approving:           'Approving…',
    rejecting:           'Sending back…',
    actionFailed:        'That didn\'t go through. Try again?',
    // Covers both "another grown-up already reviewed it" and "the child
    // took it back" (withdraw_task_completion_v2) — both surface as CH017.
    notPendingAnymore:   'This completion is no longer waiting for review.',
    notAuthorized:       'You can\'t review this one from here.',
    close:               'Close',
    // Multi-photo evidence + stale handling
    photosLabel:         'Photos ({n})',
    loadingPhotos:       'Loading photos…',
    photoPosition:       'Photo {i} of {n}',
    previousPhoto:       'Previous photo',
    nextPhoto:           'Next photo',
    openPhoto:           'Open photo {i} full screen',
    closePhoto:          'Close photo',
    photoFailed:         'This photo didn\'t load.',
    staleHint:           'Your list has been refreshed.',
    reviewBeforeDeciding: 'Look at every photo, then decide.',
  },
  contributionClaims: {
    // "One helpful thing at a time" (uq_contribution_claims_one_pending_per_member):
    // explained instead of the form silently disappearing.
    onePendingRuleTitle: 'One at a time',
    onePendingRuleBody:  'A grown-up needs to check this one first. When they do, you can send something new.',
    claimSectionHint:    'Tell a grown-up about something helpful you did.',
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
    // Reward Reserved Points — now means insufficient AVAILABLE balance
    // (gross minus this child's other pending reservations), not raw
    // gross balance. Copy stays generic/correct under either reading.
    insufficientBalance: 'You don\'t have enough points for this yet.',
    rewardArchived:      'This reward is no longer available.',
    duplicatePending:    'You already have a request waiting for approval for this reward.',
    // Distinct from an ordinary failure: signals a request-identity
    // conflict (the same client_request_id was reused for a different
    // reward) rather than an everyday retryable error.
    idempotencyConflict: 'Something went wrong with that request. Please try again.',
    // Reward Reserved Points — pending-card state (see RewardCard.tsx).
    pendingPointsLabel:  '{n} points pending',
    changedMyMindButton: 'Changed my mind',
    cancelError:         'We couldn\'t cancel that. Please try again.',
  },
  // A3 — Confirm Before Redeem. The one-time confirmation shown before a
  // request is actually sent — see ConfirmRewardRequestModal.tsx.
  // bodyTemplate's {title}/{n} placeholders are filled in by
  // confirmRewardRequestCopy.ts's formatConfirmRewardRequestBody, mirroring
  // this file's existing inline `.replace('{n}', ...)` convention used
  // elsewhere (e.g. rewards.pointsNeeded), just centralized in one pure,
  // directly-testable function since two placeholders are involved here.
  //
  // Reward Reserved Points — bodyTemplate rewritten to be reservation-
  // aware: the old "points won't be deducted until it's approved" wording
  // is no longer accurate now that a request reserves points immediately.
  // {n} appears twice deliberately — formatConfirmRewardRequestBody uses
  // replaceAll for this placeholder specifically to support that.
  rewardRedemptionConfirm: {
    title:       'Request this reward?',
    bodyTemplate: '{title} costs {n} points. {n} points will move to Pending while an adult reviews your request. If the request is declined or you change your mind, those points will return to your available balance.',
    confirmCta:  'Send request',
    cancelCta:   'Cancel',
  },
  // Reward Reserved Points — "Changed my mind" confirmation. Distinct
  // from rewardRedemptionConfirm above (that one is shown before sending
  // a request; this one is shown before withdrawing an already-pending
  // one). bodyTemplate's {n} is filled in by
  // cancelRewardRequestCopy.ts's formatCancelRewardRequestBody.
  rewardCancelConfirm: {
    title:       'Cancel this reward request?',
    bodyTemplate: 'Changed your mind? This reward request will be cancelled and your {n} pending points will be returned to your available balance.',
    keepCta:     'Keep request',
    cancelCta:   'Cancel request',
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
  // Adult Reward Review Confirmation — shown before an approve/reject tap
  // in RedemptionReviewSection actually mutates the redemption. Locked
  // Product copy: deliberately does not restate points/reward pricing
  // here (that's rewardRedemptionConfirm's job, a different flow) — this
  // confirms the review decision only. See ConfirmRewardReviewModal.tsx.
  rewardReviewConfirm: {
    approveTitle: 'Approve reward request?',
    approveBody:  'Are you sure you want to approve this reward request?',
    approveCta:   'Approve',
    rejectTitle:  'Reject reward request?',
    rejectBody:   'Are you sure you want to reject this reward request?',
    rejectCta:    'Reject',
    cancelCta:    'Cancel',
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
    showPasswordLabel:    'Show password',

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
    account:         'Account',
    // QA-01.2 — exact locked label, distinct from "Role"/"User role"/
    // "Member role"/"Account role".
    accountTypeLabel: 'Account type',
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
    titleLabel:       'Task',
    fieldPlaceholder: 'What needs to get done?',
    validationEmpty:  'Please enter a task title.',
    assigneeLabel:    'Assign to',
    openToAnyone:     'Open to anyone',
    pointsLabel:      'Points (optional)',
    pointsPlaceholder: '0',
    button:           'Create task',
    creating:         'Creating…',
    success:          'Task created successfully',
    successDetail:    '"{title}" is now in your list below.',
    error:            'We couldn\'t create that task. Please try again.',
    yourTasksTitle:   'Tasks you assigned',
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
  completionSheet: {
    title:                        'Mark it done',
    optionalEvidenceHint:         'Add a photo to show it is done, or just tap submit.',
    takePhoto:                    'Take photo',
    chooseFromGallery:            'Choose from gallery',
    takeAnother:                  'Take another photo',
    chooseAnother:                'Choose another',
    remove:                       'Remove',
    submit:                       'Submit',
    cancel:                       'Not now',
    close:                        'Close',
    // Multi-photo (up to 5)
    photosTitle:                  'Photos',
    photoCount:                   '{n} / {max}',
    addPhotosHint:                'Add up to {max} photos to show it is done, or just tap Submit.',
    addCamera:                    'Camera',
    addGallery:                   'Gallery',
    maxReached:                   'That\'s the maximum of {max} photos.',
    errorTooManyPhotos:           'You can add up to {max} photos. Remove one to add another.',
    removePhotoA11y:              'Remove photo {i}',
    previewPhotoA11y:             'Preview photo {i}',
    replaceWithCamera:            'Retake',
    replaceWithGallery:           'Replace',
    // Inline progress while sending — never the app loading screen.
    submitting:                   'Submitting…',
    uploadingPhoto:               'Uploading photo {i} of {n}…',
    uploadingSingle:              'Uploading photo…',
    keepOpenHint:                 'Keep this open until it\'s done.',
    errorInvalidMime:             'That picture type is not supported. Try another one.',
    errorUncertain:               'Something did not quite finish. Tap submit to try again.',
    errorFailed:                  'That did not go through. Try again?',
    errorUnexpected:              'Something went wrong. Please try again.',
    errorPhotoRead:               'We could not read that photo. Try again or choose another one.',
    errorPickerFailed:            'We could not open the picker. Please try again.',
    errorNotOpen:                 'This task is already finished.',
    errorNotAuthorized:           'You cannot complete this task from here.',
    errorCameraPermissionDenied:  'ChoreHero needs camera permission to take a photo.',
    errorAttemptRejected:         'Those photos could not be sent. Add, replace or remove a photo and try again.',
    // Shown when the sheet opens right after the child took back a pending
    // completion to add or change its photo.
    resendNotice:                 'Your earlier completion was taken back. Add your photo and send it again, or tap "Not now" and the task stays on your list.',
  },
  // Child-facing sheet for a completion that is waiting for review. Every
  // action withdraws the pending completion (withdraw_task_completion_v2);
  // nothing edits it in place. No raw backend codes are ever shown.
  pendingCompletion: {
    title:              'Waiting for a grown-up',
    hint:               'You sent this as done. Until a grown-up checks it, you can still change it.',
    loading:            'Looking up your completion…',
    loadFailed:         'We couldn\'t load this right now. Try again?',
    retry:              'Try again',
    addPhoto:           'Add photos',
    changePhoto:        'Change photos',
    yourPhotos:         'What you sent',
    noPhotoSent:        'You sent this without a photo.',
    cancelCompletion:   'Cancel completion',
    confirmCancelTitle: 'Cancel this completion?',
    confirmCancelBody:  'The task goes back to your list so you can finish it later.',
    confirmPhotoTitle:  'Send it again with new photos?',
    confirmPhotoBody:   'Your current completion will be taken back first, then you can send it again with your photos.',
    confirmCancel:      'Yes, cancel it',
    confirmPhoto:       'Continue',
    keep:               'Keep it',
    working:            'One moment…',
    cancelled:          'Cancelled. The task is back on your list.',
    gone:               'A grown-up already checked this one. Your list is updating — close this to see what to do next.',
    actionFailed:       'That didn\'t go through. It is still waiting for review. Try again?',
    close:              'Close',
  },
  createReward: {
    title:               'Create a reward',
    titleLabel:          'Reward',
    creating:            'Creating…',
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
  // Assigned tab — task status, from the real task + submission state.
  taskStatus: {
    open:             'Open',
    openToAnyone:     'Open to anyone',
    inProgress:       'In progress',
    waitingForReview: 'Waiting for review',
    completed:        'Completed',
    needsRetry:       'Sent back — needs another try',
    takenBack:        'Taken back by child',
  },
  startup: {
    loading:          'Loading…',
    splashA11y:       'ChoreHero is starting',
  },
  errors: {
    tryAgain: 'Try again',
    generic: 'Something did not work as expected. Want to try again?',
    network: 'Connection seems a little shaky. Check your internet and try again.',
  },
  upgrade: {
    gentleLimit:
      'You reached the Free plan limit. You can edit something existing or upgrade when it feels right.',
  },
} as const;

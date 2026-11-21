import { useMemo } from 'react';
import { resolveViewerTimeZone } from '@/domain/localDay';
import type { AdultHomeInput } from '@/features/adultHome/adultHomeModel';
import {
  selectCanApproveContributionClaim,
  selectCanApproveRedemption,
  selectCanApproveTaskCompletion,
  selectCanCreateRewards,
  selectCanCreateTasks,
  selectContributionClaims,
  selectCurrentHousehold,
  selectCurrentUser,
  selectRewardRedemptions,
  selectRewards,
  selectTasks,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';

// Slice 6A: the Adult Home model input, read from the store with the
// existing selectors. Each selector returns a stable store value; the
// input object is built in useMemo, never inside a selector (a fresh
// object from a Zustand selector loops forever, React error #185).
// Permissions come from the permission selectors, never a role compare.
export function useAdultHomeInput(): AdultHomeInput {
  const tasks           = useAppStore(selectTasks);
  const taskSubmissions = useAppStore((s) => s.taskSubmissions);
  const rewards         = useAppStore(selectRewards);
  const redemptions     = useAppStore(selectRewardRedemptions);
  const claims          = useAppStore(selectContributionClaims);
  const household       = useAppStore(selectCurrentHousehold);
  const user            = useAppStore(selectCurrentUser);

  const canReviewMissions      = useAppStore(selectCanApproveTaskCompletion);
  const canReviewRewards       = useAppStore(selectCanApproveRedemption);
  const canReviewContributions = useAppStore(selectCanApproveContributionClaim);
  const canCreateMissions      = useAppStore(selectCanCreateTasks);
  const canCreateRewards       = useAppStore(selectCanCreateRewards);

  return useMemo(
    () => ({
      tasks,
      taskSubmissions,
      rewards,
      redemptions,
      claims,
      members:  household?.members ?? [],
      viewerId: user?.id ?? null,
      permissions: { canReviewMissions, canReviewRewards, canReviewContributions, canCreateMissions, canCreateRewards },
      now:      new Date(),
      timeZone: resolveViewerTimeZone(),
    }),
    [
      tasks, taskSubmissions, rewards, redemptions, claims, household, user,
      canReviewMissions, canReviewRewards, canReviewContributions, canCreateMissions, canCreateRewards,
    ],
  );
}

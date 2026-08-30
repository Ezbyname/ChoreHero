import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';
import type { Reward, RewardRedemption, RewardRedemptionStatus } from '@/types';

// 'cancelled' (child withdrew) maps to its own distinct ActivityStatus,
// never to 'declined' — REJECTED and CANCELLED are not the same Product
// event (see familyActivity.ts's own comment on 'cancelled'). In
// practice this adapter only ever receives pending rows today
// (TodayScreen's RedemptionReviewSection passes pendingRedemptions only),
// so every non-'pending' entry here exists for type exhaustiveness /
// future-proofing, not because it is currently expected to render.
const STATUS_MAP: Record<RewardRedemptionStatus, FamilyActivity['status']> = {
  pending:   'pending',
  approved:  'completed',
  rejected:  'declined',
  cancelled: 'cancelled',
};

// Pure, no copy/i18n dependency — mirrors ContributionClaimAdapter/
// TaskAdapter exactly. Archived-reward messaging (a copy-derived string)
// is applied by the caller (TodayScreen's RedemptionReviewSection) as a
// post-processing step on the returned FamilyActivity, the same pattern
// TodayScreen already uses to filter approve/decline out of
// todayActivities for a non-privileged viewer.
//
// reward may be undefined if the corresponding reward row hasn't loaded
// (should not normally happen: RLS lets adult+ viewers see archived
// rewards too — rewards_select_household_scoped — so the same
// getRewardsForHousehold call that hydrates the rest of this screen
// already includes it). Treated as "not archived" defensively rather
// than throwing, consistent with this adapter staying pure and never
// failing on a shape it can't fully resolve.
export const RewardRedemptionAdapter = {
  toFamilyActivity(redemption: RewardRedemption, reward: Reward | undefined): FamilyActivity {
    const isArchived = reward != null && !reward.isActive;

    // Decision 7 (archived reward): an existing PENDING redemption stays
    // reviewable — reject remains available, approve does not. A
    // resolved (approved/rejected) redemption exposes no actions at all,
    // matching ContributionClaimAdapter's own unconditional
    // pending-only -> actions rule.
    const availableActions: ActivityAction[] =
      redemption.status !== 'pending' ? [] : isArchived ? ['decline'] : ['approve', 'decline'];

    return {
      id:                 redemption.id,
      kind:               'request',
      title:              reward?.title ?? redemption.rewardId,
      description:        reward?.description,
      householdId:        redemption.householdId,
      createdByProfileId: redemption.requestedByProfileId,
      targetProfileId:    undefined, // reviewer is role-gated, not one specific member
      status:             STATUS_MAP[redemption.status],
      // points_required_snapshot is the authoritative approval cost — the
      // reward's current points_required is never substituted here, even
      // though `reward` is otherwise available in scope.
      points:              redemption.pointsRequiredSnapshot,
      requiresApproval:    true,
      availableActions,
    };
  },
};

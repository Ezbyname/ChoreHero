import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ActivityList } from '@/components/ActivityList';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { ContributionClaimAdapter, RewardRedemptionAdapter, TaskAdapter } from '@/domain/adapters';
import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';
import { approveContributionClaim } from '@/features/contributions/approveContributionClaim';
import { claimContribution } from '@/features/contributions/claimContribution';
import { rejectContributionClaim } from '@/features/contributions/rejectContributionClaim';
import { approveRewardRedemption } from '@/features/rewards/approveRewardRedemption';
import { ConfirmRewardReviewModal } from '@/features/rewards/components/ConfirmRewardReviewModal';
import { rejectRewardRedemption } from '@/features/rewards/rejectRewardRedemption';
import { createConfirmGuard } from '@/features/rewards/rewardReviewConfirmationUx';
import type { ReviewAction } from '@/features/rewards/rewardReviewConfirmationUx';
import { approveTaskCompletion } from '@/features/tasks/approveTaskCompletion';
import { claimOpenTask } from '@/features/tasks/claimOpenTask';
import { completeTask } from '@/features/tasks/completeTask';
import { rejectTaskCompletion } from '@/features/tasks/rejectTaskCompletion';
import { requestTaskCompletion } from '@/features/tasks/requestTaskCompletion';
import {
  getTasksNeedingAttention,
  getUnassignedTasks,
} from '@/features/tasks/taskFilters';
import { useAppStore } from '@/store/useAppStore';
import {
  selectCanApproveTaskCompletion,
  selectCanClaimContribution,
  selectContributionClaims,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectHasPendingContributionClaimsToReview,
  selectHasPendingRedemptionsToReview,
  selectRewardRedemptions,
  selectRewards,
  selectTasks,
} from '@/store/selectors';
import { colors, radius, spacing, typography } from '@/theme';
import type { ContributionClaim, HouseholdMember, Reward, RewardRedemption, Task } from '@/types';

function isToday(isoString: string): boolean {
  const d   = new Date(isoString);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()
  );
}

function getTodayTasks(tasks: Task[]): Task[] {
  const attention  = getTasksNeedingAttention(tasks);
  const unassigned = getUnassignedTasks(tasks);
  const dueToday   = tasks.filter(
    (t) =>
      t.status !== 'completed'       &&
      t.status !== 'needs_attention' &&
      t.assigneeId !== undefined     &&
      t.dueAt !== undefined          &&
      isToday(t.dueAt),
  );

  const seen   = new Set<string>();
  const result: Task[] = [];
  for (const task of [...attention, ...unassigned, ...dueToday]) {
    if (!seen.has(task.id)) {
      seen.add(task.id);
      result.push(task);
    }
  }
  return result;
}

// ── Contribution claim review section (parent flow) ──────────────────────────
// Contribution ≠ Task: rendered from contributionClaims state, never derived
// from Task.status.

interface ReviewSectionProps {
  claims:      ContributionClaim[];
  members:     HouseholdMember[];
  householdId: string;
  role:        string | null;
  reviewerId:  string;
}

function ContributionReviewSection({ claims, members, householdId, role, reviewerId }: ReviewSectionProps) {
  const [pendingActivityId, setPendingActivityId] = useState<string | null>(null);

  const activities = useMemo(
    () => claims.map(ContributionClaimAdapter.toFamilyActivity),
    [claims],
  );

  async function handleAction(activity: FamilyActivity, action: ActivityAction) {
    if (pendingActivityId) return;
    setPendingActivityId(activity.id);
    if (action === 'approve') {
      await approveContributionClaim({ claimId: activity.id, householdId, role, reviewedByProfileId: reviewerId });
    } else if (action === 'decline') {
      await rejectContributionClaim({ claimId: activity.id, householdId, role, reviewedByProfileId: reviewerId });
    }
    setPendingActivityId(null);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{copy.contributionClaims.reviewSectionTitle}</Text>
      <ActivityList
        activities={activities}
        members={members}
        onAction={handleAction}
        pendingActivityId={pendingActivityId}
      />
    </View>
  );
}

// ── Task review section (parent flow, EX-07) ──────────────────────────────────
// Reviews tasks.status = 'needs_attention' directly — a different
// underlying record from ContributionReviewSection above, per the
// contract's "alongside the existing contribution-claims review section,
// extend not replace" instruction. approve_task_completion/
// reject_task_completion remain the authoritative mutation boundary;
// this section only calls them and reflects the result.

interface TaskReviewSectionProps {
  tasks:       Task[];
  members:     HouseholdMember[];
  householdId: string;
  role:        string | null;
}

function TaskReviewSection({ tasks, members, householdId, role }: TaskReviewSectionProps) {
  const [pendingActivityId, setPendingActivityId] = useState<string | null>(null);
  const [feedback, setFeedback]                   = useState<string | null>(null);

  const activities = useMemo(
    () => tasks.map(TaskAdapter.toFamilyActivity),
    [tasks],
  );

  async function handleAction(activity: FamilyActivity, action: ActivityAction) {
    if (pendingActivityId) return;
    if (action !== 'approve' && action !== 'decline') return;

    setPendingActivityId(activity.id);
    setFeedback(null);

    const result = action === 'approve'
      ? await approveTaskCompletion({ taskId: activity.id, householdId, role })
      : await rejectTaskCompletion({ taskId: activity.id, householdId, role });

    if (!result.ok) {
      setFeedback(
        result.reason === 'not_pending'
          ? copy.taskReview.notPending
          : action === 'approve'
            ? copy.taskReview.approveError
            : copy.taskReview.rejectError,
      );
    }

    setPendingActivityId(null);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{copy.taskReview.reviewSectionTitle}</Text>
      <ActivityList
        activities={activities}
        members={members}
        onAction={handleAction}
        pendingActivityId={pendingActivityId}
      />
      {feedback && <Text style={styles.claimFeedback}>{feedback}</Text>}
    </View>
  );
}

// ── Reward redemption review section (parent flow) ────────────────────────────
// Reviews reward_redemptions.status = 'pending' directly — a different
// underlying record from ContributionReviewSection/TaskReviewSection above.
// approve_reward_redemption/reject_reward_redemption remain the
// authoritative mutation boundary; this section only calls them and
// reflects the result. Only rendered for a privileged (owner/admin/adult)
// viewer with at least one pending redemption (selectHasPendingRedemptionsToReview
// already combines both conditions) — a child never sees this section at
// all, matching "Adult Request UI Must Not Appear"'s sibling requirement
// for review.

interface RedemptionReviewSectionProps {
  redemptions: RewardRedemption[]; // pending only — caller filters, mirrors tasksNeedingReview
  rewards:     Reward[];           // the full household array, including archived — never
                                    // RewardsScreen's activeRewards filter (Decision 7:
                                    // an archived reward's existing PENDING redemption must
                                    // stay reviewable).
  members:     HouseholdMember[];
  householdId: string;
  role:        string | null;
  reviewerId:  string;
}

function RedemptionReviewSection({
  redemptions,
  rewards,
  members,
  householdId,
  role,
  reviewerId,
}: RedemptionReviewSectionProps) {
  const [pendingActivityId, setPendingActivityId]         = useState<string | null>(null);
  const [feedback, setFeedback]                           = useState<string | null>(null);
  // Adult Reward Review Confirmation — the activity/action awaiting an
  // explicit confirm, before any mutation is attempted. Separate from
  // pendingActivityId, which continues to mean "the mutation itself is in
  // flight" exactly as before.
  const [pendingConfirmation, setPendingConfirmation]     = useState<{ activity: FamilyActivity; action: ReviewAction } | null>(null);
  // One guard per section (not per redemption row) — matches the existing
  // pendingActivityId convention, which already only allows one review
  // action in flight at a time within this section.
  const confirmGuardRef = useRef(createConfirmGuard());

  const rewardById = useMemo(() => new Map(rewards.map((r) => [r.id, r])), [rewards]);

  // Archived-reward messaging is applied here, after the pure adapter
  // runs — mirrors how todayActivities below already post-processes
  // TaskAdapter's output with a copy-derived override, rather than giving
  // the adapter itself a copy/i18n dependency.
  const activities = useMemo(
    () =>
      redemptions.map((r) => {
        const reward     = rewardById.get(r.rewardId);
        const isArchived = reward != null && !reward.isActive;
        const activity    = RewardRedemptionAdapter.toFamilyActivity(r, reward);
        return isArchived ? { ...activity, description: copy.rewardReview.archivedNotice } : activity;
      }),
    [redemptions, rewardById],
  );

  // Initial tap only opens the confirmation — no mutation happens here.
  function handleAction(activity: FamilyActivity, action: ActivityAction) {
    if (pendingActivityId || pendingConfirmation) return;
    if (action !== 'approve' && action !== 'decline') return;

    setFeedback(null);
    setPendingConfirmation({ activity, action: action === 'approve' ? 'approve' : 'reject' });
  }

  // CANCELLED — the reviewer backed out. No mutation is ever called, and
  // the underlying redemption is left completely untouched. This is
  // distinct from RewardRedemption.status = 'cancelled', which represents
  // the child withdrawing their own request — this handler never reads or
  // writes that status.
  function handleCancelConfirmation() {
    setPendingConfirmation(null);
  }

  async function handleConfirm() {
    if (!pendingConfirmation) return;
    const { activity, action } = pendingConfirmation;

    setPendingActivityId(activity.id);

    const outcome = await confirmGuardRef.current(action, {
      approve: () => approveRewardRedemption({ redemptionId: activity.id, householdId, role, reviewedByProfileId: reviewerId }),
      reject:  () => rejectRewardRedemption({ redemptionId: activity.id, householdId, role, reviewedByProfileId: reviewerId }),
    });

    setPendingConfirmation(null);

    // FAILED — confirmed, mutation attempted, mutation failed. Preserves
    // the exact existing error-reason -> copy mapping; never treated as
    // CANCELLED.
    if (outcome.kind === 'FAILED') {
      setFeedback(
        outcome.reason === 'not_found'
          ? copy.rewardReview.notFound
          : outcome.reason === 'not_pending'
            ? copy.rewardReview.notPending
            : outcome.reason === 'reward_archived'
              ? copy.rewardReview.approveArchived
              : outcome.reason === 'insufficient_balance'
                ? copy.rewardReview.approveInsufficientBalance
                : action === 'approve'
                  ? copy.rewardReview.approveError
                  : copy.rewardReview.rejectError,
      );
    }

    setPendingActivityId(null);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{copy.rewardReview.reviewSectionTitle}</Text>
      <ActivityList
        activities={activities}
        members={members}
        onAction={handleAction}
        pendingActivityId={pendingActivityId}
      />
      {feedback && <Text style={styles.claimFeedback}>{feedback}</Text>}
      <ConfirmRewardReviewModal
        visible={pendingConfirmation !== null}
        action={pendingConfirmation?.action ?? 'approve'}
        isSubmitting={pendingActivityId !== null}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirmation}
      />
    </View>
  );
}

// ── Contribution claim submission (child flow) ────────────────────────────────

interface ClaimFormProps {
  householdId:        string;
  claimedByProfileId: string;
  role:               string | null;
}

function ClaimContributionForm({ householdId, claimedByProfileId, role }: ClaimFormProps) {
  const [title, setTitle]           = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [feedback, setFeedback]     = useState<string | null>(null);

  async function handleSubmit() {
    if (isSubmitting || !title.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const result = await claimContribution({ householdId, claimedByProfileId, role, title });

    if (result.ok) {
      setTitle('');
      setFeedback(copy.contributionClaims.claimSuccess);
    } else if (result.reason === 'duplicate_pending') {
      setFeedback(copy.contributionClaims.claimDuplicatePending);
    } else {
      setFeedback(copy.contributionClaims.claimError);
    }
    setSubmitting(false);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{copy.contributionClaims.claimSectionTitle}</Text>
      <View style={styles.claimRow}>
        <TextInput
          style={styles.claimInput}
          value={title}
          onChangeText={setTitle}
          placeholder={copy.contributionClaims.claimFieldPlaceholder}
          placeholderTextColor={colors.textMuted}
          editable={!isSubmitting}
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
        />
        <TouchableOpacity
          style={[styles.claimSubmitButton, (isSubmitting || !title.trim()) && styles.claimSubmitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting || !title.trim()}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.surface} />
          ) : (
            <Text style={styles.claimSubmitText}>{copy.contributionClaims.claimSubmitButton}</Text>
          )}
        </TouchableOpacity>
      </View>
      {feedback && <Text style={styles.claimFeedback}>{feedback}</Text>}
    </View>
  );
}

export function TodayScreen() {
  const tasks        = useAppStore(selectTasks);
  const household     = useAppStore(selectCurrentHousehold);
  const user           = useAppStore(selectCurrentUser);
  const role            = useAppStore(selectCurrentMemberRole);
  const contributionClaims = useAppStore(selectContributionClaims);
  const hasReviewSection = useAppStore(selectHasPendingContributionClaimsToReview);
  const canClaim          = useAppStore(selectCanClaimContribution);
  const canApproveTaskCompletion = useAppStore(selectCanApproveTaskCompletion);
  const rewardRedemptions        = useAppStore(selectRewardRedemptions);
  const rewards                   = useAppStore(selectRewards);
  const hasRedemptionReviewSection = useAppStore(selectHasPendingRedemptionsToReview);
  const members   = household?.members ?? [];

  // Only status='pending' rows belong in the actionable review queue
  // (APPROVED/REJECTED rows must not remain actionable). Deliberately not
  // filtered by reward.isActive here — Decision 7: an existing PENDING
  // redemption for a reward that is later archived must stay reviewable
  // (reject remains available even though approve does not). rewards is
  // the full household array from selectRewards (includes archived rows
  // for an adult+ viewer per rewards_select_household_scoped's own RLS —
  // never RewardsScreen's activeRewards filter, which would silently drop
  // them from this queue). Visibility itself is Decision-11 RLS's job,
  // already applied before this array ever reaches the store (Slice 4's
  // hydration wiring) — no additional household filtering happens here.
  const pendingRedemptions = useMemo(
    () => rewardRedemptions.filter((r) => r.status === 'pending'),
    [rewardRedemptions],
  );

  // selectContributionClaims returns the raw, stable store array; filtering
  // must happen here (memoized), not inside a Zustand selector. A selector
  // that returns a freshly-.filter()'d array on every call (as
  // selectPendingContributionClaims used to, called directly here) never
  // produces a referentially-stable snapshot for useSyncExternalStore to
  // compare against — React treats every re-render as "the store changed
  // again," re-renders, gets another new array, and never converges. This
  // is what threw "Maximum update depth exceeded" (React error #185) on
  // every real hydration, with no effect and no direct setState involved.
  // A claimant must never review (approve/decline) their own claim, even
  // when they also hold contributions.approve_claim — rewards.redeem-style
  // permission inheritance grants contributions.claim_completed to every
  // role, so an owner/admin/adult reviewer can genuinely also be the
  // claimant on some other pending claim. Excluded here rather than left
  // to ContributionReviewSection, matching how todayActivities below
  // already filters approve/decline out for a non-privileged viewer of
  // their own task submission — same "never present your own submission
  // as reviewable" principle, applied to the other review surface on this
  // screen. Also enforced at the RLS layer (authoritative boundary) — see
  // supabase/migrations/20260821000000_contribution_claims_self_review.sql.
  const pendingClaims = useMemo(
    () => contributionClaims.filter((c) => c.status === 'pending' && c.claimedByProfileId !== user?.id),
    [contributionClaims, user?.id],
  );

  const todayTasks    = useMemo(() => getTodayTasks(tasks), [tasks]);
  const hasUnassigned = todayTasks.some((t) => !t.assigneeId);

  // Only a privileged (owner/admin/adult) viewer may see 'approve'/'decline'
  // on a needs_attention task here — otherwise the submitting child (or any
  // other non-privileged viewer) would see review actions on their own or
  // a sibling's pending submission in the general Today list. TaskAdapter
  // itself is viewer-agnostic (see its own comment), so this filter is the
  // minimal, adapter-signature-preserving mechanism identified during
  // planning — the dedicated TaskReviewSection below needs no equivalent
  // filter, since it only renders for privileged viewers in the first place.
  const todayActivities = useMemo(
    () => todayTasks.map(TaskAdapter.toFamilyActivity).map((activity) =>
      canApproveTaskCompletion
        ? activity
        : { ...activity, availableActions: activity.availableActions.filter((a) => a !== 'approve' && a !== 'decline') },
    ),
    [todayTasks, canApproveTaskCompletion],
  );

  const tasksNeedingReview = useMemo(() => getTasksNeedingAttention(tasks), [tasks]);
  const hasTaskReviewSection = canApproveTaskCompletion && tasksNeedingReview.length > 0;

  const [pendingTaskActivityId, setPendingTaskActivityId] = useState<string | null>(null);
  const [taskActionFeedback, setTaskActionFeedback]       = useState<string | null>(null);

  // 'claim' and 'complete' are wired here. The 'complete' action branches
  // by role: privileged (owner/admin/adult) direct completion (EX-05,
  // open -> completed, no review step) via completeTask; child completion
  // request (EX-06, open -> needs_attention, subject to EX-07 approval)
  // via requestTaskCompletion. Both reject a mismatched caller with
  // 'not_authorized' and surface it via the same feedback mechanism as
  // any other failure, not silently ignored — completeTask still defends
  // against a child reaching it directly, and requestTaskCompletion still
  // defends against a privileged role or wrong-assignee child reaching it,
  // independent of this role-based routing.
  async function handleTaskAction(activity: FamilyActivity, action: ActivityAction) {
    if (pendingTaskActivityId || !household || !user) return;
    if (action !== 'claim' && action !== 'complete') return;

    setPendingTaskActivityId(activity.id);
    setTaskActionFeedback(null);

    if (action === 'claim') {
      const result = await claimOpenTask({
        taskId:      activity.id,
        householdId: household.id,
        profileId:   user.id,
        role,
      });

      if (!result.ok) {
        setTaskActionFeedback(
          result.reason === 'already_claimed'
            ? copy.activityCard.alreadyClaimed
            : copy.activityCard.claimError,
        );
      }
    } else if (role === 'child') {
      const result = await requestTaskCompletion({
        taskId:      activity.id,
        householdId: household.id,
        profileId:   user.id,
        role,
      });

      if (!result.ok) {
        setTaskActionFeedback(
          result.reason === 'not_authorized'
            ? copy.activityCard.requestNotAllowed
            : result.reason === 'not_open'
              ? copy.activityCard.requestNotOpen
              : copy.activityCard.requestError,
        );
      }
    } else {
      const result = await completeTask({
        taskId:      activity.id,
        householdId: household.id,
        role,
      });

      if (!result.ok) {
        setTaskActionFeedback(
          result.reason === 'not_authorized'
            ? copy.activityCard.completeNotAllowed
            : result.reason === 'not_open'
              ? copy.activityCard.completeNotOpen
              : copy.activityCard.completeError,
        );
      }
    }

    setPendingTaskActivityId(null);
  }

  return (
    <Screen style={styles.screen}>
      <ScreenHeader
        title={copy.screens.today.title}
        subtitle={copy.screens.today.subtitle}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {hasReviewSection && household && (
          <ContributionReviewSection
            claims={pendingClaims}
            members={members}
            householdId={household.id}
            role={role}
            reviewerId={user?.id ?? ''}
          />
        )}

        {hasTaskReviewSection && household && (
          <TaskReviewSection
            tasks={tasksNeedingReview}
            members={members}
            householdId={household.id}
            role={role}
          />
        )}

        {hasRedemptionReviewSection && household && (
          <RedemptionReviewSection
            redemptions={pendingRedemptions}
            rewards={rewards}
            members={members}
            householdId={household.id}
            role={role}
            reviewerId={user?.id ?? ''}
          />
        )}

        {todayTasks.length === 0 ? (
          <EmptyState message={copy.emptyStates.today} emoji="🌿" />
        ) : (
          <>
            <Text style={styles.summary}>{copy.today.summary}</Text>

            {hasUnassigned && (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{copy.today.unassignedBanner}</Text>
              </View>
            )}

            <ActivityList
              activities={todayActivities}
              members={members}
              onAction={handleTaskAction}
              pendingActivityId={pendingTaskActivityId}
            />
            {taskActionFeedback && <Text style={styles.claimFeedback}>{taskActionFeedback}</Text>}
          </>
        )}

        {canClaim && household && user && (
          <ClaimContributionForm
            householdId={household.id}
            claimedByProfileId={user.id}
            role={role}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom:     spacing.xxxl,
  },
  summary: {
    ...typography.body,
    color:        colors.textSecondary,
    marginBottom: spacing.lg,
  },
  banner: {
    backgroundColor: colors.primarySoft,
    borderRadius:    12,
    padding:         spacing.md,
    marginBottom:    spacing.lg,
  },
  bannerText: {
    ...typography.caption,
    color: colors.primary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.body,
    color:        colors.textPrimary,
    fontWeight:   '600',
    marginBottom: spacing.md,
  },
  claimRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },
  claimInput: {
    ...typography.body,
    flex:              1,
    color:             colors.textPrimary,
    backgroundColor:   colors.surface,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
  },
  claimSubmitButton: {
    backgroundColor:   colors.primary,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    alignItems:        'center',
    justifyContent:    'center',
  },
  claimSubmitButtonDisabled: {
    opacity: 0.5,
  },
  claimSubmitText: {
    ...typography.caption,
    color:      colors.surface,
    fontWeight: '600',
  },
  claimFeedback: {
    ...typography.caption,
    color:     colors.textMuted,
    marginTop: spacing.sm,
  },
});
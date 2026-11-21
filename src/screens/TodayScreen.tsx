import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { ActivityList } from '@/components/ActivityList';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fieldStyles } from '@/components/ui/TextField';
import { copy } from '@/content/copy';
import { ContributionClaimAdapter, RewardRedemptionAdapter, TaskAdapter } from '@/domain/adapters';
import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';
import { approveContributionClaim } from '@/features/contributions/approveContributionClaim';
import { claimContribution } from '@/features/contributions/claimContribution';
import { claimFormStacked } from '@/features/contributions/claimFormLayout';
import {
  INITIAL_CLAIM_FORM_PHASE,
  canSubmitClaim,
  deriveClaimFormView,
  onClaimSubmitResult,
  onClaimSubmitStarted,
  onClaimSubmitThrew,
  onClaimTitleEdited,
  type ClaimFormPhase,
} from '@/features/contributions/claimContributionFormState';
import { rejectContributionClaim } from '@/features/contributions/rejectContributionClaim';
import { approveRewardRedemption } from '@/features/rewards/approveRewardRedemption';
import { ConfirmRewardReviewModal } from '@/features/rewards/components/ConfirmRewardReviewModal';
import { rejectRewardRedemption } from '@/features/rewards/rejectRewardRedemption';
import { createConfirmGuard } from '@/features/rewards/rewardReviewConfirmationUx';
import type { ReviewAction } from '@/features/rewards/rewardReviewConfirmationUx';
import { appSounds } from '@/features/sounds/appSounds';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import { claimOpenTask } from '@/features/tasks/claimOpenTask';
import { completeTask } from '@/features/tasks/completeTask';
import { PendingCompletionModal, type PendingCompletionModalTask } from '@/features/tasks/components/PendingCompletionModal';
import { TaskCompletionModal, type TaskCompletionModalTask } from '@/features/tasks/components/TaskCompletionModal';
import { TaskReviewEvidenceModal, type TaskReviewEvidenceModalTask } from '@/features/tasks/components/TaskReviewEvidenceModal';
import type { ReviewDecision } from '@/features/tasks/components/taskReviewEvidenceUiState';
import { buildTodaySections, pendingPhotoCountByTask } from '@/features/tasks/taskListSections';
import { applyViewerTaskActions } from '@/features/tasks/taskViewerActions';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
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
import { colors, radius, sizes, spacing, typography } from '@/theme';
import type { ContributionClaim, HouseholdMember, Reward, RewardRedemption, Task } from '@/types';

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

export function ContributionReviewSection({ claims, members, householdId, role, reviewerId }: ReviewSectionProps) {
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
      <SectionHeader title={copy.contributionClaims.reviewSectionTitle} count={claims.length} />
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
// Reviews tasks.status = 'needs_attention'. Approve / Decline open the shared
// TaskReviewEvidenceModal, which owns the pending-submission lookup, the
// authorized evidence fetch, and the V2 approve/reject orchestration. Each
// card shows how many photos the pending submission has — from submission
// metadata only; no evidence bytes are fetched for the list. This is the
// ONLY place a reviewer sees an actionable pending task (see
// buildTodaySections): the general list below never repeats it.

interface TaskReviewSectionProps {
  tasks:       Task[];
  members:     HouseholdMember[];
  role:        string | null;
  photoCounts: Map<string, number>;
}

export function TaskReviewSection({ tasks, members, role, photoCounts }: TaskReviewSectionProps) {
  const [reviewTarget, setReviewTarget]     = useState<TaskReviewEvidenceModalTask | null>(null);
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision | null>(null);

  const activities = useMemo(
    () => tasks.map(TaskAdapter.toFamilyActivity),
    [tasks],
  );

  function handleAction(activity: FamilyActivity, action: ActivityAction) {
    if (action !== 'approve' && action !== 'decline') return;
    const task = tasks.find((t) => t.id === activity.id);
    if (!task || !task.householdId) return;
    // No network action at card-tap time — the decision happens in the
    // Modal, after the reviewer has seen the evidence.
    setReviewTarget({ id: task.id, householdId: task.householdId, title: task.title });
    setReviewDecision(action === 'approve' ? 'approve' : 'reject');
  }

  function closeReview() {
    setReviewTarget(null);
    setReviewDecision(null);
  }

  return (
    <View style={styles.section}>
      <SectionHeader title={copy.taskReview.reviewSectionTitle} count={tasks.length} />
      <ActivityList
        activities={activities}
        members={members}
        onAction={handleAction}
        pendingActivityId={null}
        decorate={(a) => ({ photoCount: photoCounts.get(a.id) })}
      />
      <TaskReviewEvidenceModal
        task={reviewTarget}
        initialDecision={reviewDecision}
        role={role}
        onCompleted={closeReview}
        onClose={closeReview}
      />
    </View>
  );
}

// ── Reward redemption review section (parent flow) ────────────────────────────
// Reviews reward_redemptions.status = 'pending'. approve_reward_redemption/
// reject_reward_redemption remain the authoritative mutation boundary. Only
// rendered for a privileged viewer with at least one pending redemption.

interface RedemptionReviewSectionProps {
  redemptions: RewardRedemption[]; // pending only — caller filters
  rewards:     Reward[];           // the full household array, including archived (Decision 7)
  members:     HouseholdMember[];
  householdId: string;
  role:        string | null;
  reviewerId:  string;
}

export function RedemptionReviewSection({
  redemptions,
  rewards,
  members,
  householdId,
  role,
  reviewerId,
}: RedemptionReviewSectionProps) {
  const [pendingActivityId, setPendingActivityId]         = useState<string | null>(null);
  const [feedback, setFeedback]                           = useState<string | null>(null);
  // The activity/action awaiting an explicit confirm, before any mutation.
  const [pendingConfirmation, setPendingConfirmation]     = useState<{ activity: FamilyActivity; action: ReviewAction } | null>(null);
  const confirmGuardRef = useRef(createConfirmGuard());

  const rewardById = useMemo(() => new Map(rewards.map((r) => [r.id, r])), [rewards]);

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

  // The reviewer backed out — no mutation, the redemption is untouched.
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
      if (outcome.reason === 'not_pending' || outcome.reason === 'not_found') requestHouseholdRefresh('stale');
    }

    setPendingActivityId(null);
  }

  return (
    <View style={styles.section}>
      <SectionHeader title={copy.rewardReview.reviewSectionTitle} count={redemptions.length} />
      <ActivityList
        activities={activities}
        members={members}
        onAction={handleAction}
        pendingActivityId={pendingActivityId}
      />
      {feedback && <Banner tone="danger" text={feedback} />}
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
  // Title of this member's own pending claim from the store, or null.
  myPendingTitle:     string | null;
}

// The backend allows ONE pending helpful claim per member
// (uq_contribution_claims_one_pending_per_member) and offers no edit or
// cancel for it. So while one is pending the input is replaced by that
// claim's status AND an explicit explanation of the rule — the form never
// just disappears.
export function ClaimContributionForm({ householdId, claimedByProfileId, role, myPendingTitle }: ClaimFormProps) {
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<ClaimFormPhase>(INITIAL_CLAIM_FORM_PHASE);
  // Correctness barrier against a double tap landing before the disabled
  // state re-renders; the disabled button is only the UX hint.
  const inFlightRef = useRef(false);
  const view = deriveClaimFormView(phase, myPendingTitle);
  const submitEnabled = canSubmitClaim(phase, title);
  // Large font on a narrow phone: input above a full-width button rather
  // than a clipped placeholder (claimFormLayout.ts).
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const stacked = claimFormStacked(windowWidth, fontScale);

  async function handleSubmit() {
    if (inFlightRef.current || !canSubmitClaim(phase, title)) return;
    inFlightRef.current = true;
    // Close the keyboard so the result below the input is actually visible.
    Keyboard.dismiss();
    setPhase(onClaimSubmitStarted());
    const submittedTitle = title;
    try {
      const result = await claimContribution({ householdId, claimedByProfileId, role, title: submittedTitle });
      if (result.ok) setTitle('');
      setPhase(onClaimSubmitResult(result, submittedTitle));
    } catch {
      setPhase(onClaimSubmitThrew());
    } finally {
      inFlightRef.current = false;
    }
  }

  function handleChangeText(next: string) {
    setTitle(next);
    setPhase(onClaimTitleEdited);
  }

  return (
    <View style={styles.section}>
      <SectionHeader title={copy.contributionClaims.claimSectionTitle} hint={view.kind === 'form' ? copy.contributionClaims.claimSectionHint : null} />
      {view.kind === 'form' ? (
        <Card style={styles.claimCard}>
          <View style={[styles.claimRow, stacked && styles.claimRowStacked]}>
            <TextInput
              style={[styles.claimInput, stacked && styles.claimInputStacked]}
              value={title}
              onChangeText={handleChangeText}
              placeholder={copy.contributionClaims.claimFieldPlaceholder}
              placeholderTextColor={colors.textMuted}
              editable={!view.submitting}
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              accessibilityLabel={copy.contributionClaims.claimFieldPlaceholder}
            />
            <Pressable
              style={({ pressed }) => [styles.claimSubmitButton, stacked && styles.claimSubmitStacked, !submitEnabled && styles.claimSubmitButtonDisabled, pressed && submitEnabled && styles.claimSubmitPressed]}
              onPress={handleSubmit}
              disabled={!submitEnabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: !submitEnabled, busy: view.submitting }}
              accessibilityLabel={copy.contributionClaims.claimSubmitButton}
            >
              {view.submitting ? (
                <ActivityIndicator size="small" color={colors.textOnColor} />
              ) : (
                <Text style={styles.claimSubmitText}>{copy.contributionClaims.claimSubmitButton}</Text>
              )}
            </Pressable>
          </View>
          {view.error && (
            <Banner
              tone="danger"
              text={view.error === 'duplicate_pending'
                ? copy.contributionClaims.claimDuplicatePending
                : copy.contributionClaims.claimError}
            />
          )}
        </Card>
      ) : (
        <View style={styles.claimStatusGroup}>
          <Banner
            tone={view.kind === 'sent' ? 'success' : 'warning'}
            title={view.kind === 'sent' ? copy.contributionClaims.claimSuccess : copy.contributionClaims.pendingBadge}
            text={view.title}
          />
          <Banner tone="neutral" title={copy.contributionClaims.onePendingRuleTitle} text={copy.contributionClaims.onePendingRuleBody} />
        </View>
      )}
    </View>
  );
}

// headerTrailing: optional navigation slot passed in by the tab shell (Slice 4).
// The screen itself never navigates.
export function TodayScreen({ headerTrailing }: { headerTrailing?: React.ReactNode } = {}) {
  const refreshControl = useHouseholdRefreshControl();
  const tasks              = useAppStore(selectTasks);
  const household          = useAppStore(selectCurrentHousehold);
  const user               = useAppStore(selectCurrentUser);
  const role               = useAppStore(selectCurrentMemberRole);
  const contributionClaims = useAppStore(selectContributionClaims);
  const hasReviewSection   = useAppStore(selectHasPendingContributionClaimsToReview);
  const canClaim           = useAppStore(selectCanClaimContribution);
  const canApproveTaskCompletion   = useAppStore(selectCanApproveTaskCompletion);
  const rewardRedemptions          = useAppStore(selectRewardRedemptions);
  const rewards                    = useAppStore(selectRewards);
  const hasRedemptionReviewSection = useAppStore(selectHasPendingRedemptionsToReview);
  const taskSubmissions            = useAppStore((s) => s.taskSubmissions);
  const members   = household?.members ?? [];

  // Memoized off the raw stable store arrays — filtering inside a Zustand
  // selector would return a fresh array every call and loop forever
  // (React error #185).
  const myPendingClaimTitle = useMemo(() => {
    if (!user) return null;
    const mine = contributionClaims.find(
      (c) => c.claimedByProfileId === user.id && c.status === 'pending',
    );
    return mine ? mine.title : null;
  }, [contributionClaims, user]);

  // Only status='pending' rows are actionable. Not filtered by
  // reward.isActive (Decision 7: archived rewards stay reviewable).
  const pendingRedemptions = useMemo(
    () => rewardRedemptions.filter((r) => r.status === 'pending'),
    [rewardRedemptions],
  );

  // A claimant never reviews their own claim (also enforced by RLS).
  const pendingClaims = useMemo(
    () => contributionClaims.filter((c) => c.status === 'pending' && c.claimedByProfileId !== user?.id),
    [contributionClaims, user?.id],
  );

  // One actionable item, one card: a reviewer's pending tasks live ONLY in
  // the review section (see buildTodaySections).
  const sections = useMemo(
    () => buildTodaySections(tasks, { canReview: canApproveTaskCompletion }),
    [tasks, canApproveTaskCompletion],
  );
  const photoCounts   = useMemo(() => pendingPhotoCountByTask(taskSubmissions), [taskSubmissions]);
  const hasUnassigned = sections.generalTasks.some((t) => !t.assigneeId);

  // Viewer-specific actions: a non-reviewer never sees approve/decline on a
  // waiting task; the submitting child gets 'manage_completion' instead.
  const todayActivities = useMemo(
    () => sections.generalTasks.map(TaskAdapter.toFamilyActivity).map((activity) =>
      applyViewerTaskActions(activity, { canApproveTaskCompletion, viewerId: user?.id ?? null, role }),
    ),
    [sections.generalTasks, canApproveTaskCompletion, user, role],
  );

  const [pendingTaskActivityId, setPendingTaskActivityId] = useState<string | null>(null);
  const [taskActionFeedback, setTaskActionFeedback]       = useState<string | null>(null);
  const [completionTarget, setCompletionTarget] = useState<TaskCompletionModalTask | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  // The child's "waiting for review" sheet. Hosted by THIS screen, so every
  // follow-up (cancel, change photos) keeps the child on Today.
  const [pendingTarget, setPendingTarget] = useState<PendingCompletionModalTask | null>(null);

  // 'complete' branches by role: privileged direct completion (EX-05) via
  // completeTask; a child opens the completion sheet (EX-06 via V2).
  async function handleTaskAction(activity: FamilyActivity, action: ActivityAction) {
    if (pendingTaskActivityId || !household || !user) return;
    if (action === 'manage_completion') {
      setPendingTarget({ id: activity.id, householdId: household.id, title: activity.title });
      return;
    }
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
      setCompletionTarget({
        id:          activity.id,
        householdId: household.id,
        title:       activity.title,
      });
      setPendingTaskActivityId(null);
      return;
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

  const nothingToShow =
    sections.reviewTasks.length === 0 && sections.generalTasks.length === 0 &&
    !(hasReviewSection && pendingClaims.length > 0) && !hasRedemptionReviewSection;

  return (
    <Screen style={styles.screen}>
      <ScreenHeader
        title={copy.screens.today.title}
        subtitle={copy.screens.today.subtitle}
        trailing={headerTrailing}
      />

      {/* "handled": with the default ('never') the first tap on a button
          while the keyboard is up only dismisses the keyboard and the press
          is dropped — which is how "Send for approval" appeared to do
          nothing. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {sections.reviewTasks.length > 0 && household && (
          <TaskReviewSection
            tasks={sections.reviewTasks}
            members={members}
            role={role}
            photoCounts={photoCounts}
          />
        )}

        {hasReviewSection && household && pendingClaims.length > 0 && (
          <ContributionReviewSection
            claims={pendingClaims}
            members={members}
            householdId={household.id}
            role={role}
            reviewerId={user?.id ?? ''}
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

        {sections.generalTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={copy.today.tasksSectionTitle} count={sections.generalTasks.length} hint={copy.today.summary} />
            {hasUnassigned && (
              <View style={styles.bannerGap}>
                <Banner tone="primary" text={copy.today.unassignedBanner} />
              </View>
            )}
            <ActivityList
              activities={todayActivities}
              members={members}
              onAction={handleTaskAction}
              pendingActivityId={pendingTaskActivityId}
            />
            {taskActionFeedback && <Banner tone="danger" text={taskActionFeedback} />}
          </View>
        )}

        {nothingToShow && (
          <View style={styles.empty}>
            <EmptyState message={copy.emptyStates.today} emoji="🌿" />
          </View>
        )}

        {canClaim && household && user && (
          <ClaimContributionForm
            householdId={household.id}
            claimedByProfileId={user.id}
            role={role}
            myPendingTitle={myPendingClaimTitle}
          />
        )}
      </ScrollView>

      <PendingCompletionModal
        task={pendingTarget}
        role={role}
        onReopenForPhoto={(task) => {
          // Withdrawn on the server; the task is open. The completion
          // Modal starts a NEW logical attempt (fresh ids at selection).
          setPendingTarget(null);
          setCompletionNotice(copy.completionSheet.resendNotice);
          setCompletionTarget(task);
        }}
        onClose={() => setPendingTarget(null)}
      />

      <TaskCompletionModal
        task={completionTarget}
        notice={completionNotice}
        onCompleted={(submission) => {
          if (submission) appSounds.play('completion_submitted', submission.id);
          setCompletionTarget(null);
          setCompletionNotice(null);
          // Background refresh: the card moves to "Waiting for review" in
          // place. Never a re-hydration (that showed the global loading
          // screen and dropped the child back on Today's first tab state).
          requestHouseholdRefresh('mutation');
        }}
        onClose={() => {
          setCompletionTarget(null);
          setCompletionNotice(null);
        }}
      />
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
  section: {
    marginBottom: spacing.xl,
  },
  bannerGap: {
    marginBottom: spacing.md,
  },
  empty: {
    minHeight: 220,
  },
  claimCard: {
    gap: spacing.md,
  },
  claimRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },
  claimInput: {
    ...fieldStyles.input,
    flex: 1,
    // Lets the input shrink on narrow phones (360dp) so the send button
    // stays inside the card. Without it, web gives inputs an intrinsic
    // minimum width.
    minWidth: 0,
  },
  // Stacked (large font, narrow phone): full-width input, then button.
  claimRowStacked: {
    flexDirection: 'column',
    alignItems:    'stretch',
  },
  claimInputStacked: {
    flex: 0,
  },
  claimSubmitStacked: {
    maxWidth:        '100%',
    paddingVertical: spacing.sm,
  },
  claimSubmitButton: {
    minHeight:         sizes.tapTarget,
    backgroundColor:   colors.primary,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    alignItems:        'center',
    justifyContent:    'center',
    maxWidth:          140,
  },
  claimSubmitPressed: {
    backgroundColor: colors.primaryPressed,
  },
  claimSubmitButtonDisabled: {
    opacity: 0.5,
  },
  claimSubmitText: {
    ...typography.label,
    color:     colors.textOnColor,
    textAlign: 'center',
  },
  claimStatusGroup: {
    gap: spacing.sm,
  },
});

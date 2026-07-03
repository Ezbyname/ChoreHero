import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ContributionClaimCard } from '@/components/ContributionClaimCard';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TaskCard } from '@/components/TaskCard';
import { copy } from '@/content/copy';
import { approveContributionClaim } from '@/features/contributions/approveContributionClaim';
import { claimContribution } from '@/features/contributions/claimContribution';
import { rejectContributionClaim } from '@/features/contributions/rejectContributionClaim';
import { getMemberNameByUserId } from '@/features/household/householdUtils';
import {
  getTasksNeedingAttention,
  getUnassignedTasks,
} from '@/features/tasks/taskFilters';
import { useAppStore } from '@/store/useAppStore';
import {
  selectCanClaimContribution,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectHasPendingContributionClaimsToReview,
  selectPendingContributionClaims,
  selectTasks,
} from '@/store/selectors';
import { colors, radius, spacing, typography } from '@/theme';
import type { ContributionClaim, HouseholdMember, Task } from '@/types';

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
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  async function handleApprove(claimId: string) {
    if (pendingActionId) return;
    setPendingActionId(claimId);
    await approveContributionClaim({ claimId, householdId, role, reviewedByProfileId: reviewerId });
    setPendingActionId(null);
  }

  async function handleReject(claimId: string) {
    if (pendingActionId) return;
    setPendingActionId(claimId);
    await rejectContributionClaim({ claimId, householdId, role, reviewedByProfileId: reviewerId });
    setPendingActionId(null);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{copy.contributionClaims.reviewSectionTitle}</Text>
      {claims.map((claim) => (
        <ContributionClaimCard
          key={claim.id}
          claim={claim}
          claimantName={getMemberNameByUserId(members, claim.claimedByProfileId)}
        >
          <View style={styles.reviewActions}>
            <TouchableOpacity
              style={[styles.reviewButton, styles.rejectButton]}
              onPress={() => handleReject(claim.id)}
              disabled={pendingActionId === claim.id}
              activeOpacity={0.8}
            >
              <Text style={styles.rejectButtonText}>{copy.contributionClaims.rejectButton}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reviewButton, styles.approveButton]}
              onPress={() => handleApprove(claim.id)}
              disabled={pendingActionId === claim.id}
              activeOpacity={0.8}
            >
              {pendingActionId === claim.id ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Text style={styles.approveButtonText}>{copy.contributionClaims.approveButton}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ContributionClaimCard>
      ))}
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
  const pendingClaims    = useAppStore(selectPendingContributionClaims);
  const hasReviewSection = useAppStore(selectHasPendingContributionClaimsToReview);
  const canClaim          = useAppStore(selectCanClaimContribution);
  const members   = household?.members ?? [];

  const todayTasks    = useMemo(() => getTodayTasks(tasks), [tasks]);
  const hasUnassigned = todayTasks.some((t) => !t.assigneeId);

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

            {todayTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                assigneeName={getMemberNameByUserId(members, task.assigneeId)}
              />
            ))}
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
  reviewActions: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginTop:     spacing.md,
  },
  reviewButton: {
    flex:            1,
    borderRadius:    radius.md,
    paddingVertical: spacing.sm,
    alignItems:      'center',
    justifyContent:  'center',
  },
  rejectButton: {
    backgroundColor: colors.background,
    borderWidth:     1,
    borderColor:     colors.borderSoft,
  },
  rejectButtonText: {
    ...typography.caption,
    color:      colors.textSecondary,
    fontWeight: '600',
  },
  approveButton: {
    backgroundColor: colors.primary,
  },
  approveButtonText: {
    ...typography.caption,
    color:      colors.surface,
    fontWeight: '600',
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

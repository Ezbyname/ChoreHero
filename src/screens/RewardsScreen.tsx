import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { getMemberNameByUserId } from '@/features/household/householdUtils';
import { RewardCard } from '@/features/rewards/components/RewardCard';
import { createReward } from '@/features/rewards/createReward';
import { computeMyPointsSummary, selectReservedPendingSnapshots } from '@/features/rewards/pointsSummary';
import { sortRewardsForDisplay } from '@/features/rewards/sortRewards';
import { useAppStore } from '@/store/useAppStore';
import {
  selectCanCancelRedemption,
  selectCanCreateRewards,
  selectCanRequestRedemption,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectMyPointsBalance,
  selectPointsBalances,
  selectRewardRedemptions,
  selectRewards,
} from '@/store/selectors';
import { colors, radius, spacing, typography } from '@/theme';

function CreateRewardForm({
  householdId,
  createdByProfileId,
  role,
}: {
  householdId:        string;
  createdByProfileId: string;
  role:                string | null;
}) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [pointsText, setPointsText]   = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback]       = useState<string | null>(null);
  const [validation, setValidation]   = useState<string | null>(null);

  async function handleCreate() {
    if (isSubmitting) return;

    const trimmed = title.trim();
    if (!trimmed) {
      setValidation(copy.createReward.validationEmpty);
      return;
    }

    const requiredPoints = Number(pointsText.trim());
    if (!Number.isInteger(requiredPoints) || requiredPoints <= 0) {
      setValidation(copy.createReward.validationPoints);
      return;
    }

    setValidation(null);
    setFeedback(null);
    setIsSubmitting(true);

    const result = await createReward({
      householdId,
      title:              trimmed,
      description:        description.trim() || undefined,
      requiredPoints,
      createdByProfileId,
      role,
    });

    if (result.ok) {
      setTitle('');
      setDescription('');
      setPointsText('');
      setFeedback(copy.createReward.success);
    } else {
      setFeedback(copy.createReward.error);
    }
    setIsSubmitting(false);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{copy.createReward.title}</Text>

      <TextInput
        style={[styles.input, validation && styles.inputError]}
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          if (validation) setValidation(null);
        }}
        placeholder={copy.createReward.fieldPlaceholder}
        placeholderTextColor={colors.textMuted}
        editable={!isSubmitting}
        returnKeyType="done"
      />

      <Text style={styles.label}>{copy.createReward.descriptionLabel}</Text>
      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={description}
        onChangeText={setDescription}
        placeholder={copy.createReward.descriptionPlaceholder}
        placeholderTextColor={colors.textMuted}
        editable={!isSubmitting}
        multiline
      />

      <Text style={styles.label}>{copy.createReward.pointsLabel}</Text>
      <TextInput
        style={styles.input}
        value={pointsText}
        onChangeText={(text) => {
          setPointsText(text);
          if (validation) setValidation(null);
        }}
        placeholder={copy.createReward.pointsPlaceholder}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        editable={!isSubmitting}
      />
      {validation && <Text style={styles.validationText}>{validation}</Text>}

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={isSubmitting}
        activeOpacity={0.8}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : (
          <Text style={styles.buttonText}>{copy.createReward.button}</Text>
        )}
      </TouchableOpacity>

      {feedback && <Text style={styles.feedbackText}>{feedback}</Text>}
    </View>
  );
}

export function RewardsScreen() {
  const rewards           = useAppStore(selectRewards);
  const pointsBalances    = useAppStore(selectPointsBalances);
  const myBalance          = useAppStore(selectMyPointsBalance);
  const household          = useAppStore(selectCurrentHousehold);
  const user                 = useAppStore(selectCurrentUser);
  const role                  = useAppStore(selectCurrentMemberRole);
  const canCreateRewards       = useAppStore(selectCanCreateRewards);
  const canRequestRedemption   = useAppStore(selectCanRequestRedemption);
  const canCancelRedemption    = useAppStore(selectCanCancelRedemption);
  // selectRewardRedemptions returns the raw, stable store array — the same
  // "filter locally, not inside the selector" rule TodayScreen's
  // pendingClaims already follows (see its own comment for why a
  // freshly-.filter()'d selector breaks useSyncExternalStore's snapshot
  // comparison and causes an infinite re-render loop).
  const rewardRedemptions      = useAppStore(selectRewardRedemptions);
  const members        = household?.members ?? [];

  // A2 — Reward Sorting. Sorting is a separate, later step from the
  // existing active/archived visibility filter above it, not folded into
  // it — see sortRewards.ts for the locked, viewer-independent ordering
  // contract (requiredPoints ASC -> title ASC -> id ASC).
  const activeRewards = sortRewardsForDisplay(rewards.filter((r) => r.isActive));

  // Never assume pointsBalances[0] is the viewer's own balance — a member
  // with no balance row yet (e.g. a child who hasn't earned points) reads
  // as 0, the same "absent balance -> 0" convention the request RPC and
  // its own mock-mode branch already use, not a fabricated value.
  const grossBalance = myBalance?.balance ?? 0;

  // This viewer's own PENDING redemption per reward, if any (Decision 8:
  // at most one). A resolved (approved/rejected/cancelled) historical row is
  // deliberately excluded — it must never block a new request (Decision 3).
  const myPendingByRewardId = useMemo(() => {
    const map = new Map<string, (typeof rewardRedemptions)[number]>();
    for (const r of rewardRedemptions) {
      if (r.requestedByProfileId === user?.id && r.status === 'pending') {
        map.set(r.rewardId, r);
      }
    }
    return map;
  }, [rewardRedemptions, user?.id]);

  // Reward Reserved Points — this viewer's own RESERVED pending snapshots
  // only. Deliberately re-filters rewardRedemptions directly (not derived
  // from myPendingByRewardId above) because the two lists serve different
  // purposes: myPendingByRewardId must include a legacy pending row too
  // (it still blocks a duplicate request and still renders as a pending
  // reward card — Decision 8 is unaffected by the reservation model), but
  // a legacy row must never enter the Available/Pending reservation math
  // — see selectReservedPendingSnapshots's own comment.
  const myPendingSnapshots = useMemo(
    () => selectReservedPendingSnapshots(rewardRedemptions, user?.id ?? ''),
    [rewardRedemptions, user?.id],
  );

  const { available: viewerBalance, pending: viewerPending } = computeMyPointsSummary(
    grossBalance,
    myPendingSnapshots,
  );

  return (
    <Screen style={styles.screen}>
      <ScreenHeader
        title={copy.screens.rewards.title}
        subtitle={copy.screens.rewards.subtitle}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {canCreateRewards && household && user && (
          <CreateRewardForm
            householdId={household.id}
            createdByProfileId={user.id}
            role={role}
          />
        )}

        <Text style={styles.sectionLabel}>{copy.rewards.familyPoints}</Text>
        <View style={styles.pointsSection}>
          {pointsBalances.map((pb) => (
            <View key={pb.userId} style={styles.pointsRow}>
              <Text style={styles.pointsName}>
                {getMemberNameByUserId(members, pb.userId)}
              </Text>
              <Text style={styles.pointsValue}>
                {pb.balance} {copy.rewards.pointsLabel}
              </Text>
            </View>
          ))}
        </View>

        {role === 'child' && (
          <View style={styles.pointsSection}>
            <View style={styles.pointsRow}>
              <Text style={styles.pointsName}>{copy.rewards.myPointsAvailable.replace('{n}', String(viewerBalance))}</Text>
            </View>
            <View style={styles.pointsRow}>
              <Text style={styles.pointsName}>{copy.rewards.myPointsPending.replace('{n}', String(viewerPending))}</Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionLabel}>{copy.rewards.availableRewards}</Text>

        {activeRewards.length === 0 ? (
          <EmptyState message={copy.rewards.noRewards} emoji="🎁" />
        ) : (
          activeRewards.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              viewerBalance={viewerBalance}
              memberName={user ? getMemberNameByUserId(members, user.id) : ''}
              canRequest={canRequestRedemption}
              canCancel={canCancelRedemption}
              pendingRedemption={myPendingByRewardId.get(reward.id)}
              householdId={household?.id ?? ''}
              requestedByProfileId={user?.id ?? ''}
              role={role}
            />
          ))
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
  sectionLabel: {
    ...typography.caption,
    color:         colors.textMuted,
    fontWeight:    '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom:  spacing.sm,
    marginTop:     spacing.lg,
  },
  pointsSection: {
    backgroundColor: colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     colors.borderSoft,
    paddingVertical: spacing.xs,
    marginBottom:    spacing.md,
  },
  pointsRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  pointsName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  pointsValue: {
    ...typography.body,
    color:      colors.primary,
    fontWeight: '600',
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
  label: {
    ...typography.caption,
    color:      colors.textMuted,
    fontWeight: '600',
    marginTop:  spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    color:             colors.textPrimary,
    backgroundColor:   colors.surface,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
  },
  multilineInput: {
    minHeight:         72,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#B91C1C',
  },
  validationText: {
    ...typography.caption,
    color: '#B91C1C',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    alignItems:      'center',
    marginTop:       spacing.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    color:      colors.surface,
    fontWeight: '600',
  },
  feedbackText: {
    ...typography.caption,
    color:     colors.textMuted,
    marginTop: spacing.sm,
  },
});

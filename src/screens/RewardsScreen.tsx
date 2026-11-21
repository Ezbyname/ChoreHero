import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { TextField } from '@/components/ui/TextField';
import { copy } from '@/content/copy';
import { getMemberNameByUserId } from '@/features/household/householdUtils';
import { RewardCard } from '@/features/rewards/components/RewardCard';
import { createReward } from '@/features/rewards/createReward';
import { computeMyPointsSummary, selectReservedPendingSnapshots } from '@/features/rewards/pointsSummary';
import { sortRewardsForDisplay } from '@/features/rewards/sortRewards';
import { createSingleFlight } from '@/features/tasks/createTaskFormState';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
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
import { colors, sizes, spacing, typography } from '@/theme';

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
  const [result, setResult]           = useState<{ kind: 'created'; title: string } | { kind: 'failed' } | null>(null);
  const [validation, setValidation]   = useState<string | null>(null);
  // One tap = one reward (a second tap before the re-render is dropped).
  const singleFlight = useRef(createSingleFlight()).current;

  async function doCreate() {
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
    setResult(null);
    setIsSubmitting(true);

    try {
      const created = await createReward({
        householdId,
        title:              trimmed,
        description:        description.trim() || undefined,
        requiredPoints,
        createdByProfileId,
        role,
      });

      if (created.ok) {
        setTitle('');
        setDescription('');
        setPointsText('');
        setResult({ kind: 'created', title: trimmed });
      } else {
        setResult({ kind: 'failed' });
      }
    } catch {
      setResult({ kind: 'failed' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.section}>
      <SectionHeader title={copy.createReward.title} />
      <Card style={styles.formCard}>
        {result?.kind === 'created' && (
          <Banner tone="success" title={copy.createReward.success} text={result.title} />
        )}
        <TextField
          label={copy.createReward.titleLabel}
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            setResult(null);
            if (validation) setValidation(null);
          }}
          placeholder={copy.createReward.fieldPlaceholder}
          editable={!isSubmitting}
          returnKeyType="done"
        />
        <TextField
          label={copy.createReward.descriptionLabel}
          value={description}
          onChangeText={setDescription}
          placeholder={copy.createReward.descriptionPlaceholder}
          editable={!isSubmitting}
          multiline
        />
        <TextField
          label={copy.createReward.pointsLabel}
          value={pointsText}
          onChangeText={(text) => {
            setPointsText(text);
            if (validation) setValidation(null);
          }}
          placeholder={copy.createReward.pointsPlaceholder}
          keyboardType="number-pad"
          editable={!isSubmitting}
          error={validation}
        />
        {result?.kind === 'failed' && <Banner tone="danger" text={copy.createReward.error} />}
        <AppButton
          label={copy.createReward.button}
          icon="add-circle-outline"
          onPress={() => { void singleFlight(() => doCreate()); }}
          busy={isSubmitting}
          busyLabel={copy.createReward.creating}
        />
      </Card>
    </View>
  );
}

export function RewardsScreen() {
  const refreshControl = useHouseholdRefreshControl();
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
        refreshControl={refreshControl}
      >
        {canCreateRewards && household && user && (
          <CreateRewardForm
            householdId={household.id}
            createdByProfileId={user.id}
            role={role}
          />
        )}

        {role === 'child' && (
          <View style={styles.section}>
            <View style={styles.myPointsRow}>
              <Card style={styles.myPointsCard} accent="primary">
                <Text style={styles.myPointsValue}>{viewerBalance}</Text>
                <Text style={styles.myPointsLabel}>{copy.rewards.myPointsAvailableLabel}</Text>
              </Card>
              <Card style={styles.myPointsCard}>
                <Text style={styles.myPointsValue}>{viewerPending}</Text>
                <Text style={styles.myPointsLabel}>{copy.rewards.myPointsPendingLabel}</Text>
              </Card>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title={copy.rewards.familyPoints} />
          <Card style={styles.pointsCard}>
            {pointsBalances.length === 0 ? (
              <Text style={styles.pointsName}>{copy.rewards.noPointsYet}</Text>
            ) : pointsBalances.map((pb, index) => (
              <View key={pb.userId} style={[styles.pointsRow, index > 0 && styles.pointsRowDivider]}>
                <Text style={styles.pointsName}>
                  {getMemberNameByUserId(members, pb.userId)}
                </Text>
                <Text style={styles.pointsValue}>
                  ⭐ {pb.balance} {copy.rewards.pointsLabel}
                </Text>
              </View>
            ))}
          </Card>
        </View>

        <SectionHeader title={copy.rewards.availableRewards} count={activeRewards.length} />

        {activeRewards.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState message={copy.rewards.noRewards} emoji="🎁" />
          </View>
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
  section: {
    marginBottom: spacing.xl,
  },
  formCard: {
    gap: spacing.md,
  },
  empty: {
    minHeight: 200,
  },
  myPointsRow: {
    flexDirection: 'row',
    gap:           spacing.md,
  },
  myPointsCard: {
    flex:       1,
    alignItems: 'center',
    gap:        2,
  },
  myPointsValue: {
    ...typography.title,
    color: colors.primary,
  },
  myPointsLabel: {
    ...typography.label,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  pointsCard: {
    paddingVertical: spacing.xs,
  },
  pointsRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    minHeight:       sizes.tapTarget,
    paddingVertical: spacing.sm,
  },
  pointsRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  pointsName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  pointsValue: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { copy } from '@/content/copy';
import { CancelRewardRequestModal } from '@/features/rewards/components/CancelRewardRequestModal';
import { ConfirmRewardRequestModal } from '@/features/rewards/components/ConfirmRewardRequestModal';
import { useRewardRequestFlow } from '@/features/rewards/useRewardRequestFlow';
import { colors, spacing, typography } from '@/theme';
import type { Reward, RewardRedemption } from '@/types';

interface RewardCardProps {
  reward:               Reward;
  // The current viewer's own AVAILABLE balance (Reward Reserved Points:
  // gross balance minus the sum of the viewer's own other currently-
  // PENDING reservations) — resolved by the caller via
  // computeMyPointsSummary, never the raw points_balances row. 0 when the
  // viewer has no balance row yet (repo convention: absent balance reads
  // as 0 client- and server-side — see request_reward_redemption's own
  // v_balance NOT FOUND -> 0 handling); never fabricated beyond that
  // convention.
  viewerBalance:        number;
  memberName:           string;
  // Exact child-role gate from selectCanRequestRedemption — an adult/
  // admin/owner never receives true here, even though the underlying
  // permission string structurally inherits to them. When false, this
  // component renders no request affordance at all (hidden, not merely
  // disabled) — satisfies "Adult Request UI Must Not Appear".
  canRequest:           boolean;
  // Reward Reserved Points — exact child-role gate from
  // selectCanCancelRedemption, mirroring canRequest's own rationale.
  // Governs whether "Changed my mind" can even be tapped; the backend RPC
  // independently re-derives and enforces ownership regardless.
  canCancel:            boolean;
  // This viewer's own PENDING redemption for this specific reward, if
  // any (Decision 8: at most one). A resolved (approved/rejected/
  // cancelled) historical row is deliberately not passed here — it must
  // never be treated as an active pending block (Decision 3).
  pendingRedemption:    RewardRedemption | undefined;
  householdId:          string;
  requestedByProfileId: string;
  role:                 string | null;
}

// The request / "Changed my mind" logic (client_request_id lifecycle,
// confirm-before-request, cancel) lives in useRewardRequestFlow (Slice 5D),
// shared with the child Rewards screen. This card only renders it.
export function RewardCard({
  reward,
  viewerBalance,
  memberName,
  canRequest,
  canCancel,
  pendingRedemption,
  householdId,
  requestedByProfileId,
  role,
}: RewardCardProps) {
  const { requiredPoints } = reward;
  const canAfford          = viewerBalance >= requiredPoints;
  const remaining          = requiredPoints - viewerBalance;
  const isPending           = pendingRedemption !== undefined;

  const flow = useRewardRequestFlow({
    reward, viewerBalance, canRequest, pendingRedemption, householdId, requestedByProfileId, role,
  });

  return (
    <Card style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.title}>{reward.title}</Text>
        <StatusPill
          label={canAfford
            ? copy.rewards.availableNow
            : copy.rewards.morePointsToGo.replace('{n}', String(remaining))}
          tone={canAfford ? 'success' : 'primary'}
        />
      </View>

      {reward.description ? (
        <Text style={styles.description}>{reward.description}</Text>
      ) : null}

      <Text style={styles.pointsNeeded}>
        ⭐ {copy.rewards.pointsNeeded.replace('{n}', String(requiredPoints))}
      </Text>

      <Text style={styles.memberHint}>
        {copy.rewards.memberHasPoints
          .replace('{name}', memberName)
          .replace('{n}', String(viewerBalance))}
      </Text>

      {canRequest && (
        isPending ? (
          <View style={styles.pendingGroup}>
            <Banner
              tone="warning"
              title={copy.rewardRedemption.pendingBadge}
              text={copy.rewardRedemption.pendingPointsLabel.replace('{n}', String(pendingRedemption.pointsRequiredSnapshot))}
            />
            {canCancel && (
              <AppButton
                label={copy.rewardRedemption.changedMyMindButton}
                variant="secondary"
                busy={flow.isCancelling}
                onPress={flow.openCancel}
              />
            )}
            {flow.cancelFeedback && <Banner tone="danger" text={flow.cancelFeedback} />}
          </View>
        ) : (
          <>
            <AppButton
              label={copy.rewardRedemption.requestButton}
              icon="gift-outline"
              onPress={flow.openConfirm}
              disabled={!flow.requestAvailable}
              busy={flow.isSubmitting}
            />
            {flow.feedback && <Banner tone="danger" text={flow.feedback} />}
          </>
        )
      )}

      <ConfirmRewardRequestModal
        visible={flow.confirmVisible}
        rewardTitle={reward.title}
        requiredPoints={requiredPoints}
        onConfirm={flow.confirmRequest}
        onCancel={flow.closeConfirm}
      />

      <CancelRewardRequestModal
        visible={flow.cancelVisible}
        pendingPoints={pendingRedemption?.pointsRequiredSnapshot ?? 0}
        onKeepRequest={flow.closeCancel}
        onCancelRequest={flow.confirmCancel}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    gap:          spacing.sm,
  },
  topRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    gap:            spacing.sm,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex:  1,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  pointsNeeded: {
    ...typography.label,
    color: colors.primary,
  },
  memberHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  pendingGroup: {
    gap: spacing.sm,
  },
});

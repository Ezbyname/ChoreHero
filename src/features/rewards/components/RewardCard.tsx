import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { copy } from '@/content/copy';
import { CancelRewardRequestModal } from '@/features/rewards/components/CancelRewardRequestModal';
import { ConfirmRewardRequestModal } from '@/features/rewards/components/ConfirmRewardRequestModal';
import { cancelRewardRedemption, type CancelRewardRedemptionResult } from '@/features/rewards/cancelRewardRedemption';
import { requestRewardRedemption, type RequestRewardRedemptionResult } from '@/features/rewards/requestRewardRedemption';
import { isRedemptionRequestAvailable, resolveClientRequestId, nextClientRequestId } from '@/features/rewards/rewardRequestUx';
import { colors, radius, shadows, spacing, typography } from '@/theme';
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

// ── client_request_id lifecycle (Decision 10, client side) ───────────────────
//
// The decision logic (which id to reuse vs. mint, and when) is pure and
// lives in rewardRequestUx.ts — resolveClientRequestId / nextClientRequestId
// — where it is directly unit-tested. This component only supplies the
// React-side storage for it: pendingRequestIdRef, scoped to this mounted
// RewardCard instance (one instance per reward — RewardsScreen renders
// these with key={reward.id}), holding the current cycle's id (or null
// between cycles).
//
// Known limitation, not silently glossed over: the ref is component-scoped,
// not a persisted store. Unmounting/remounting RewardCard (e.g. navigating
// away from RewardsScreen and back) loses the in-flight retry id — a
// genuinely new UUID will be generated on the next press even if a prior
// attempt from before the remount is still outstanding server-side. No
// persistent request-tracking layer exists anywhere in this codebase to
// reuse instead; building one is out of scope for this feature (see the
// approved slice's "do not invent a generalized idempotency framework"
// instruction).
function generateClientRequestId(): string {
  return crypto.randomUUID();
}

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

  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [feedback, setFeedback]             = useState<string | null>(null);
  // A3 — Confirm Before Redeem. Gates the existing handleRequest below —
  // opening/cancelling this never itself calls handleRequest, so Cancel is
  // guaranteed to never invoke the request path (see ConfirmRewardRequestModal
  // for why a real Modal is used here instead of Alert.alert).
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const pendingRequestIdRef                 = useRef<string | null>(null);

  // Reward Reserved Points — "Changed my mind" state, mirroring the
  // request-confirmation state above exactly.
  const [isCancelVisible, setIsCancelVisible] = useState(false);
  const [isCancelling, setIsCancelling]       = useState(false);
  const [cancelFeedback, setCancelFeedback]   = useState<string | null>(null);

  function feedbackFor(result: Extract<RequestRewardRedemptionResult, { ok: false }>): string {
    switch (result.reason) {
      case 'reward_archived':
        return copy.rewardRedemption.rewardArchived;
      case 'insufficient_balance':
        return copy.rewardRedemption.insufficientBalance;
      case 'duplicate_pending':
        return copy.rewardRedemption.duplicatePending;
      case 'idempotency_conflict':
        return copy.rewardRedemption.idempotencyConflict;
      case 'not_authorized':
      case 'reward_not_found':
      case 'failed':
      default:
        return copy.rewardRedemption.requestError;
    }
  }

  const requestAvailable = isRedemptionRequestAvailable({
    canRequestPermission: canRequest,
    rewardIsActive:       reward.isActive,
    viewerBalance,
    requiredPoints,
    hasPendingRedemption: isPending,
    isSubmitting,
  });

  async function handleRequest() {
    if (!requestAvailable) return;

    const clientRequestId = resolveClientRequestId(pendingRequestIdRef.current, generateClientRequestId);
    pendingRequestIdRef.current = clientRequestId;

    setIsSubmitting(true);
    setFeedback(null);

    const result = await requestRewardRedemption({
      rewardId:             reward.id,
      householdId,
      requestedByProfileId,
      role,
      clientRequestId,
    });

    pendingRequestIdRef.current = nextClientRequestId(clientRequestId, result);
    if (!result.ok) {
      setFeedback(feedbackFor(result));
    }

    setIsSubmitting(false);
  }

  // A3 — Confirm Before Redeem. The confirmation is only a gate in front
  // of the existing handleRequest — client_request_id resolution,
  // isSubmitting, the RPC call, and error/success handling all remain
  // exactly as they were, unmoved and untouched.
  function handleConfirmRequest() {
    setIsConfirmVisible(false);
    void handleRequest();
  }

  function handleCancelRequestModal() {
    setIsConfirmVisible(false);
  }

  function cancelFeedbackFor(result: Extract<CancelRewardRedemptionResult, { ok: false }>): string {
    // Every reason collapses to the same generic message — mirrors
    // rewardReview.rejectError's own single-message convention for the
    // adult reject action; the distinctions (not_found/not_pending/
    // not_own_redemption/not_authorized/failed) are for logging/tests,
    // not user-facing differentiation.
    void result;
    return copy.rewardRedemption.cancelError;
  }

  // Reward Reserved Points — "Changed my mind". Mirrors
  // handleConfirmRequest's gate-in-front-of-the-real-action shape exactly.
  async function handleCancelConfirmed() {
    if (!pendingRedemption || isCancelling) return;
    setIsCancelVisible(false);
    setIsCancelling(true);
    setCancelFeedback(null);

    const result = await cancelRewardRedemption({
      redemptionId:         pendingRedemption.id,
      householdId,
      role,
      requestedByProfileId,
    });

    if (!result.ok) {
      setCancelFeedback(cancelFeedbackFor(result));
    }
    setIsCancelling(false);
  }

  function handleKeepRequest() {
    setIsCancelVisible(false);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{reward.title}</Text>

      {reward.description ? (
        <Text style={styles.description}>{reward.description}</Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.pointsNeeded}>
          {copy.rewards.pointsNeeded.replace('{n}', String(requiredPoints))}
        </Text>

        <View style={[styles.badge, canAfford ? styles.badgeReady : styles.badgePending]}>
          <Text style={[styles.badgeText, canAfford ? styles.badgeTextReady : styles.badgeTextPending]}>
            {canAfford
              ? copy.rewards.availableNow
              : copy.rewards.morePointsToGo.replace('{n}', String(remaining))}
          </Text>
        </View>
      </View>

      <Text style={styles.memberHint}>
        {copy.rewards.memberHasPoints
          .replace('{name}', memberName)
          .replace('{n}', String(viewerBalance))}
      </Text>

      {canRequest && (
        isPending ? (
          <View style={styles.pendingCard}>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{copy.rewardRedemption.pendingBadge}</Text>
            </View>
            <Text style={styles.pendingPointsText}>
              {copy.rewardRedemption.pendingPointsLabel.replace('{n}', String(pendingRedemption.pointsRequiredSnapshot))}
            </Text>

            {canCancel && (
              <TouchableOpacity
                style={[styles.changedMyMindButton, isCancelling && styles.buttonDisabled]}
                onPress={() => setIsCancelVisible(true)}
                disabled={isCancelling}
                activeOpacity={0.8}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Text style={styles.changedMyMindButtonText}>{copy.rewardRedemption.changedMyMindButton}</Text>
                )}
              </TouchableOpacity>
            )}
            {cancelFeedback && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{cancelFeedback}</Text>
              </View>
            )}
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[
                styles.requestButton,
                !requestAvailable && styles.requestButtonDisabled,
              ]}
              onPress={() => setIsConfirmVisible(true)}
              disabled={!requestAvailable}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Text style={styles.requestButtonText}>{copy.rewardRedemption.requestButton}</Text>
              )}
            </TouchableOpacity>
            {feedback && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{feedback}</Text>
              </View>
            )}
          </>
        )
      )}

      <ConfirmRewardRequestModal
        visible={isConfirmVisible}
        rewardTitle={reward.title}
        requiredPoints={requiredPoints}
        onConfirm={handleConfirmRequest}
        onCancel={handleCancelRequestModal}
      />

      <CancelRewardRequestModal
        visible={isCancelVisible}
        pendingPoints={pendingRedemption?.pointsRequiredSnapshot ?? 0}
        onKeepRequest={handleKeepRequest}
        onCancelRequest={handleCancelConfirmed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.borderSoft,
    padding:         spacing.lg,
    marginBottom:    spacing.md,
    ...shadows.card,
  },
  title: {
    ...typography.body,
    color:        colors.textPrimary,
    fontWeight:   '600',
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.caption,
    color:        colors.textSecondary,
    marginBottom: spacing.sm,
  },
  footer: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   spacing.xs,
  },
  pointsNeeded: {
    ...typography.caption,
    color: colors.textMuted,
  },
  badge: {
    borderRadius:      radius.pill,
    paddingVertical:   3,
    paddingHorizontal: spacing.sm,
  },
  badgeReady: {
    backgroundColor: colors.success,
  },
  badgePending: {
    backgroundColor: colors.primarySoft,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  badgeTextReady: {
    color: '#065F46',
  },
  badgeTextPending: {
    color: colors.primary,
  },
  memberHint: {
    ...typography.caption,
    color:     colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  requestButton: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: spacing.sm,
    alignItems:      'center',
    marginTop:       spacing.md,
  },
  requestButtonDisabled: {
    opacity: 0.5,
  },
  requestButtonText: {
    ...typography.body,
    color:      colors.surface,
    fontWeight: '600',
  },
  pendingCard: {
    marginTop: spacing.md,
  },
  pendingBadge: {
    alignSelf:         'flex-start',
    backgroundColor:   colors.primarySoft,
    borderRadius:      radius.pill,
    paddingVertical:   spacing.xs,
    paddingHorizontal: spacing.md,
  },
  pendingBadgeText: {
    ...typography.caption,
    color:      colors.primary,
    fontWeight: '600',
  },
  pendingPointsText: {
    ...typography.caption,
    color:      colors.textSecondary,
    fontWeight: '600',
    marginTop:  spacing.xs,
  },
  changedMyMindButton: {
    borderWidth:     1,
    borderColor:     colors.borderSoft,
    borderRadius:    radius.md,
    paddingVertical: spacing.sm,
    alignItems:      'center',
    marginTop:       spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  changedMyMindButtonText: {
    ...typography.body,
    color:      colors.textSecondary,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: colors.errorSoft,
    borderRadius:    8,
    padding:         spacing.md,
    marginTop:       spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: '#B91C1C',
  },
});

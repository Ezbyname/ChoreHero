import * as Crypto from 'expo-crypto';
import { useRef, useState } from 'react';
import { copy } from '@/content/copy';
import { cancelRewardRedemption } from '@/features/rewards/cancelRewardRedemption';
import { requestRewardRedemption, type RequestRewardRedemptionResult } from '@/features/rewards/requestRewardRedemption';
import { isRedemptionRequestAvailable, nextClientRequestId, resolveClientRequestId } from '@/features/rewards/rewardRequestUx';
import type { Reward, RewardRedemption } from '@/types';

// The child's reward request and "Changed my mind" flow, moved out of
// RewardCard unchanged (Slice 5D) so the child Rewards screen and the
// existing RewardCard share one implementation:
//   - Confirm before request (the caller shows ConfirmRewardRequestModal
//     while confirmVisible).
//   - One client_request_id per intentional request (Decision 10): reused
//     for a same-key retry after a generic failure, cleared otherwise.
//   - isRedemptionRequestAvailable gates the press; the request RPC stays
//     the authoritative boundary (balance, duplicate pending, archived).
//   - Cancel goes through cancelRewardRedemption, which returns the held
//     Points on the server.
//
// Known limitation (unchanged from RewardCard): the retry id lives in a
// ref scoped to the mounted component. Remounting loses it.
//
// expo-crypto's randomUUID, not the Hermes `crypto` global, which isn't
// guaranteed in this runtime (Build-4 Send Request investigation).
function generateClientRequestId(): string {
  return Crypto.randomUUID();
}

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

export function useRewardRequestFlow({
  reward,
  viewerBalance,
  canRequest,
  pendingRedemption,
  householdId,
  requestedByProfileId,
  role,
}: {
  reward:               Reward;
  // The viewer's own AVAILABLE (free) Points.
  viewerBalance:        number;
  canRequest:           boolean;
  // This viewer's own PENDING redemption for this reward, if any.
  pendingRedemption:    RewardRedemption | undefined;
  householdId:          string;
  requestedByProfileId: string;
  role:                 string | null;
}) {
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [feedback, setFeedback]               = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible]   = useState(false);
  const pendingRequestIdRef                   = useRef<string | null>(null);
  const [cancelVisible, setCancelVisible]     = useState(false);
  const [isCancelling, setIsCancelling]       = useState(false);
  const [cancelFeedback, setCancelFeedback]   = useState<string | null>(null);

  const requestAvailable = isRedemptionRequestAvailable({
    canRequestPermission: canRequest,
    rewardIsActive:       reward.isActive,
    viewerBalance,
    requiredPoints:       reward.requiredPoints,
    hasPendingRedemption: pendingRedemption !== undefined,
    isSubmitting,
  });

  // The whole body is guarded, from before client_request_id resolution,
  // so no exit is silent. On a throw the retry id is kept: the server may
  // have received the request, and reusing the key prevents a duplicate.
  async function handleRequest(): Promise<boolean> {
    try {
      if (!requestAvailable) {
        setFeedback(copy.rewardRedemption.requestError);
        return false;
      }
      const clientRequestId = resolveClientRequestId(pendingRequestIdRef.current, generateClientRequestId);
      pendingRequestIdRef.current = clientRequestId;
      setIsSubmitting(true);
      setFeedback(null);
      const result = await requestRewardRedemption({
        rewardId: reward.id,
        householdId,
        requestedByProfileId,
        role,
        clientRequestId,
      });
      pendingRequestIdRef.current = nextClientRequestId(clientRequestId, result);
      if (!result.ok) {
        setFeedback(feedbackFor(result));
        return false;
      }
      return true;
    } catch {
      setFeedback(copy.rewardRedemption.requestError);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  // The confirmation closes only once the outcome is known, so a failure
  // never looks like pressing Cancel.
  async function confirmRequest() {
    await handleRequest();
    setConfirmVisible(false);
  }

  async function confirmCancel() {
    if (!pendingRedemption || isCancelling) return;
    setCancelVisible(false);
    setIsCancelling(true);
    setCancelFeedback(null);
    const result = await cancelRewardRedemption({
      redemptionId: pendingRedemption.id,
      householdId,
      role,
      requestedByProfileId,
    });
    // Every reason collapses to one message (the distinctions are for
    // logs and tests).
    if (!result.ok) setCancelFeedback(copy.rewardRedemption.cancelError);
    setIsCancelling(false);
  }

  return {
    requestAvailable,
    isSubmitting,
    feedback,
    confirmVisible,
    openConfirm:   () => setConfirmVisible(true),
    closeConfirm:  () => setConfirmVisible(false),
    confirmRequest,
    isCancelling,
    cancelFeedback,
    cancelVisible,
    openCancel:    () => setCancelVisible(true),
    closeCancel:   () => setCancelVisible(false),
    confirmCancel,
  };
}

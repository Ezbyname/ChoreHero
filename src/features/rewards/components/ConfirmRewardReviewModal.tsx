import React from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { copy } from '@/content/copy';
import type { ReviewAction } from '@/features/rewards/rewardReviewConfirmationUx';

// Adult Reward Review Confirmation. One generic modal for both actions
// (approve/reject) rather than two near-identical components, per the
// locked implementation shape. RN core `Modal`, not `Alert.alert`: this
// project's react-native-web dependency implements Alert.alert as a
// complete no-op (see ConfirmRewardRequestModal.tsx's own comment), so
// this confirmation would never appear on Web if built on Alert. Mirrors
// ConfirmRewardRequestModal.tsx / CancelRewardRequestModal.tsx's exact
// structure. `onRequestClose` (Android hardware back) is wired to the
// same cancel path as the Cancel button — both must produce CANCELLED,
// never a mutation.
//
// Reject's cautious treatment reuses the existing `warning` token (already
// used elsewhere for cardAttention/badgeAttention) rather than introducing
// a new destructive/danger color — this design system has none.
export function ConfirmRewardReviewModal({
  visible,
  action,
  isSubmitting,
  onConfirm,
  onCancel,
}: {
  visible:      boolean;
  action:       ReviewAction;
  isSubmitting: boolean;
  onConfirm:    () => void;
  onCancel:     () => void;
}) {
  const isReject   = action === 'reject';
  const title      = isReject ? copy.rewardReviewConfirm.rejectTitle : copy.rewardReviewConfirm.approveTitle;
  const body       = isReject ? copy.rewardReviewConfirm.rejectBody : copy.rewardReviewConfirm.approveBody;
  const confirmCta = isReject ? copy.rewardReviewConfirm.rejectCta : copy.rewardReviewConfirm.approveCta;

  return (
    <ConfirmDialog
      visible={visible}
      title={title}
      body={body}
      primary={{ label: confirmCta, onPress: onConfirm, variant: isReject ? 'danger' : 'primary' }}
      secondary={{ label: copy.rewardReviewConfirm.cancelCta, onPress: onCancel }}
      onDismiss={onCancel}
      busy={isSubmitting}
    />
  );
}

import React from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { copy } from '@/content/copy';
import { formatConfirmRewardRequestBody } from '@/features/rewards/confirmRewardRequestCopy';

// A3 — Confirm Before Redeem. RN core `Modal`, not `Alert.alert`: this
// project's react-native-web dependency implements Alert.alert as a
// complete no-op (node_modules/react-native-web/src/exports/Alert/index.js
// — `static alert() {}`), so using it here would mean this confirmation —
// and therefore every reward request — could never even appear on Web.
// Modal has a real, substantial react-native-web implementation (portal +
// focus trap), so it behaves consistently on both supported platforms.
// `onRequestClose` (Android hardware back) is wired to the same cancel
// path as the Cancel button — both must produce no request, matching the
// locked Cancel contract.
export function ConfirmRewardRequestModal({
  visible,
  rewardTitle,
  requiredPoints,
  onConfirm,
  onCancel,
}: {
  visible:        boolean;
  rewardTitle:    string;
  requiredPoints: number;
  onConfirm:      () => void;
  onCancel:       () => void;
}) {
  return (
    <ConfirmDialog
      visible={visible}
      title={copy.rewardRedemptionConfirm.title}
      body={formatConfirmRewardRequestBody(rewardTitle, requiredPoints)}
      primary={{ label: copy.rewardRedemptionConfirm.confirmCta, onPress: onConfirm }}
      secondary={{ label: copy.rewardRedemptionConfirm.cancelCta, onPress: onCancel }}
      onDismiss={onCancel}
    />
  );
}

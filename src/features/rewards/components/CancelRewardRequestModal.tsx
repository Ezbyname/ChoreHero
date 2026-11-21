import React from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { copy } from '@/content/copy';
import { formatCancelRewardRequestBody } from '@/features/rewards/cancelRewardRequestCopy';

// Reward Reserved Points — "Changed my mind" confirmation. Mirrors
// ConfirmRewardRequestModal.tsx's structure and its RN-core-Modal-not-
// Alert.alert rationale exactly (react-native-web's Alert.alert is a
// no-op — see that file's own comment). The destructive action here is
// "Cancel request", not "Send request" — a separate component rather than
// a parameterized reuse of ConfirmRewardRequestModal, since the two flows'
// copy, button semantics (primary vs. destructive), and callers are
// distinct enough that sharing one component would couple them
// unnecessarily.
export function CancelRewardRequestModal({
  visible,
  pendingPoints,
  onKeepRequest,
  onCancelRequest,
}: {
  visible:         boolean;
  pendingPoints:   number;
  onKeepRequest:   () => void;
  onCancelRequest: () => void;
}) {
  return (
    <ConfirmDialog
      visible={visible}
      title={copy.rewardCancelConfirm.title}
      body={formatCancelRewardRequestBody(pendingPoints)}
      primary={{ label: copy.rewardCancelConfirm.keepCta, onPress: onKeepRequest }}
      secondary={{ label: copy.rewardCancelConfirm.cancelCta, onPress: onCancelRequest, variant: 'dangerOutline' }}
      onDismiss={onKeepRequest}
    />
  );
}

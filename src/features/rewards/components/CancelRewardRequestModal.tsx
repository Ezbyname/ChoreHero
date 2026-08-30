import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { copy } from '@/content/copy';
import { formatCancelRewardRequestBody } from '@/features/rewards/cancelRewardRequestCopy';
import { colors, radius, spacing, typography } from '@/theme';

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeepRequest}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{copy.rewardCancelConfirm.title}</Text>
          <Text style={styles.body}>{formatCancelRewardRequestBody(pendingPoints)}</Text>

          <TouchableOpacity style={styles.keepButton} onPress={onKeepRequest} activeOpacity={0.8}>
            <Text style={styles.keepButtonText}>{copy.rewardCancelConfirm.keepCta}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onCancelRequest} activeOpacity={0.8}>
            <Text style={styles.cancelButtonText}>{copy.rewardCancelConfirm.cancelCta}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         spacing.xl,
  },
  card: {
    width:           '100%',
    maxWidth:        360,
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.xl,
  },
  title: {
    ...typography.heading,
    color:        colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color:        colors.textSecondary,
    marginBottom: spacing.lg,
  },
  keepButton: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    alignItems:      'center',
    marginBottom:    spacing.sm,
  },
  keepButtonText: {
    ...typography.body,
    color:      colors.surface,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    alignItems:      'center',
  },
  cancelButtonText: {
    ...typography.body,
    color: colors.textMuted,
  },
});

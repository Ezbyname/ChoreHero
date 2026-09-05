import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { copy } from '@/content/copy';
import { colors, radius, spacing, typography } from '@/theme';
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <TouchableOpacity
            style={[styles.confirmButton, isReject && styles.confirmButtonReject]}
            onPress={onConfirm}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <Text style={styles.confirmButtonText}>{confirmCta}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelButtonText}>{copy.rewardReviewConfirm.cancelCta}</Text>
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
  confirmButton: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    alignItems:      'center',
    marginBottom:    spacing.sm,
  },
  confirmButtonReject: {
    backgroundColor: colors.warning,
  },
  confirmButtonText: {
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

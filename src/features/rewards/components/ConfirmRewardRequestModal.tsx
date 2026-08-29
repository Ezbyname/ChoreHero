import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { copy } from '@/content/copy';
import { formatConfirmRewardRequestBody } from '@/features/rewards/confirmRewardRequestCopy';
import { colors, radius, spacing, typography } from '@/theme';

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{copy.rewardRedemptionConfirm.title}</Text>
          <Text style={styles.body}>{formatConfirmRewardRequestBody(rewardTitle, requiredPoints)}</Text>

          <TouchableOpacity style={styles.confirmButton} onPress={onConfirm} activeOpacity={0.8}>
            <Text style={styles.confirmButtonText}>{copy.rewardRedemptionConfirm.confirmCta}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.8}>
            <Text style={styles.cancelButtonText}>{copy.rewardRedemptionConfirm.cancelCta}</Text>
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

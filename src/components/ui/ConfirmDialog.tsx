import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { AppButton, type AppButtonVariant } from '@/components/ui/AppButton';
import { colors, radius, shadows, spacing, typography } from '@/theme';

type DialogAction = { label: string; onPress: () => void; variant?: AppButtonVariant };

type Props = {
  visible:   boolean;
  title:     string;
  body:      string;
  primary:   DialogAction;
  secondary: DialogAction;
  // Android Back / backdrop dismissal — always the SAFE action.
  onDismiss: () => void;
  // Primary action in flight: spinner, both buttons blocked.
  busy?:     boolean;
};

// The one centered confirmation dialog (RN Modal, not Alert.alert —
// react-native-web's Alert.alert is a no-op, so these confirmations must
// stay real components to work on Web too).
export function ConfirmDialog({ visible, title, body, primary, secondary, onDismiss, busy = false }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? () => undefined : onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            <AppButton label={primary.label} variant={primary.variant ?? 'primary'} onPress={primary.onPress} busy={busy} busyLabel={primary.label} />
            <AppButton label={secondary.label} variant={secondary.variant ?? 'ghost'} onPress={secondary.onPress} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: colors.overlay,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         spacing.xl,
  },
  card: {
    width:           '100%',
    maxWidth:        400,
    backgroundColor: colors.surface,
    borderRadius:    radius.xl,
    padding:         spacing.xl,
    gap:             spacing.sm,
    ...shadows.soft,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actions: {
    gap:       spacing.sm,
    marginTop: spacing.md,
  },
});

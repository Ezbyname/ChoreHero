import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { copy } from '@/content/copy';
import { colors, spacing, typography } from '@/theme';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

// Full-area error state (the counterpart of EmptyState / LoadingView), with
// an optional way out.
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.emoji}>😔</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <AppButton label={copy.errors.tryAgain} icon="refresh" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    gap:               spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor:   colors.background,
  },
  emoji: {
    fontSize: 48,
  },
  message: {
    ...typography.body,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
});

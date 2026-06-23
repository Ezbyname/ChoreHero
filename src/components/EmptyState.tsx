import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface EmptyStateProps {
  message: string;
  emoji?: string;
}

export function EmptyState({ message, emoji = '🌿' }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:             1,
    alignItems:       'center',
    justifyContent:   'center',
    paddingHorizontal: spacing.xxxl,
    gap:              spacing.md,
  },
  emoji: {
    fontSize: 40,
  },
  message: {
    ...typography.body,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
});

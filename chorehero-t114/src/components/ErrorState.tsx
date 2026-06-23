import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>😔</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingBottom:  spacing.xxxl,
  },
  emoji: {
    fontSize:     48,
    marginBottom: spacing.md,
  },
  message: {
    ...typography.body,
    color:        colors.textMuted,
    textAlign:    'center',
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.primarySoft,
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius:    radius.pill,
  },
  buttonText: {
    ...typography.button,
    color: colors.primary,
  },
});

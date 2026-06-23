import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🌧</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: spacing.xxxl,
    gap:               spacing.lg,
  },
  emoji: {
    fontSize: 40,
  },
  message: {
    ...typography.body,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: spacing.xxl,
    paddingVertical:   spacing.sm + 2,
    backgroundColor:   colors.borderSoft,
    borderRadius:      radius.pill,
  },
  buttonText: {
    ...typography.button,
    color: colors.textPrimary,
  },
});

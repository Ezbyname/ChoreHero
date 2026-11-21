import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/theme';

// Calm full-area loading state for NON-startup waits (e.g. re-loading
// after creating a profile). Startup itself is covered by StartupSplash.
export function LoadingView({ message }: { message?: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? <Text style={styles.text}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    gap:               spacing.md,
    backgroundColor:   colors.background,
    paddingHorizontal: spacing.xl,
  },
  text: {
    ...typography.body,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
});

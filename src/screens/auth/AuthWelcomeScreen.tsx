import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/theme';

export function AuthWelcomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to ChoreHero</Text>
        <Text style={styles.subtitle}>
          Sign in is almost ready. We are setting up the safe foundation first.
        </Text>
        <Text style={styles.body}>
          Your family tasks and rewards will appear here after sign in.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.background,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth:   320,
  },
  title: {
    ...typography.heading,
    color:        colors.textPrimary,
    textAlign:    'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color:        colors.textMuted,
    textAlign:    'center',
    marginBottom: spacing.lg,
  },
  body: {
    ...typography.caption,
    color:     colors.textMuted,
    textAlign: 'center',
  },
});

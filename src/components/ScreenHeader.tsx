import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
}

export function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop:    spacing.xxl,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color:        colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
});

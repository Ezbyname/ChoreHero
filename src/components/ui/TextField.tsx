import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, sizes, spacing, typography, type Density } from '@/theme';

type Props = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  label:    string;
  // Field-level validation message, shown under the input.
  error?:   string | null;
  multiline?: boolean;
  children?: React.ReactNode; // e.g. a "Show password" row under the input
  // Locked design field (radius 12, min height 52) for either intensity.
  // Omitted = legacy 48dp field, unchanged.
  density?: Density;
};

// One input style for the whole app: label, 48dp field, error state.
export function TextField({ label, error, multiline, children, accessibilityLabel, density, ...input }: Props) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        multiline={multiline}
        accessibilityLabel={accessibilityLabel ?? label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, density ? fieldStyles.locked : null, multiline && styles.multiline, !!error && styles.inputError]}
      />
      {children}
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

export const fieldStyles = StyleSheet.create({
  input: {
    ...typography.body,
    minHeight:         sizes.tapTarget,
    color:             colors.textPrimary,
    backgroundColor:   colors.surface,
    borderWidth:       1,
    borderColor:       colors.border,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
  },
  // Opt-in locked field; never applied when `density` is omitted.
  locked: {
    minHeight:    sizes.lockedField,
    borderRadius: radius.field,
  },
});

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  input: fieldStyles.input,
  multiline: {
    minHeight:         96,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});

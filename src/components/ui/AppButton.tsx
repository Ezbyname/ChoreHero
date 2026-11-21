import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, depth, radius, sizes, spacing, typography, type Density } from '@/theme';

// 'gold' is ONLY for Points / reward actions (locked design rule).
export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline' | 'gold';

type Props = {
  label:     string;
  onPress:   () => void;
  variant?:  AppButtonVariant;
  disabled?: boolean;
  // Shows a spinner in place of the label and blocks presses.
  busy?:     boolean;
  // Optional spoken label while busy, e.g. "Uploading photo 2 of 3".
  busyLabel?: string;
  icon?:     keyof typeof Ionicons.glyphMap;
  compact?:  boolean;
  // Locked design intensity. Omitted = legacy rendering, unchanged.
  //   child: 56dp, radius 14, 4dp depth edge on primary / gold
  //   adult: 48dp, radius 14, flat
  density?:  Density;
  style?:    StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

// The one button used across the app: consistent height (48dp tap
// target), radius, typography and pressed/disabled/busy states.
export function AppButton({
  label, onPress, variant = 'primary', disabled = false, busy = false, busyLabel, icon, compact = false, density, style, accessibilityHint,
}: Props) {
  const inactive = disabled || busy;
  const fg = FOREGROUND[variant];
  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={busy && busyLabel ? busyLabel : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.base,
        density ? DENSITY[density] : null,
        // A density-opted (locked design) button never drops below the 48dp
        // tap target when compact; compact then only trims the padding.
        compact && (density ? styles.compactDense : styles.compact),
        BACKGROUND[variant],
        density === 'child' ? CHILD_EDGE[variant] : null,
        pressed && !inactive && PRESSED[variant],
        disabled && !busy && styles.disabled,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.label, { color: fg }]} numberOfLines={2}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const FOREGROUND: Record<AppButtonVariant, string> = {
  primary:       colors.textOnColor,
  secondary:     colors.textPrimary,
  ghost:         colors.primary,
  danger:        colors.textOnColor,
  dangerOutline: colors.danger,
  gold:          colors.onGold,
};

const BACKGROUND = StyleSheet.create({
  primary:       { backgroundColor: colors.primary },
  secondary:     { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  ghost:         { backgroundColor: 'transparent' },
  danger:        { backgroundColor: colors.danger },
  dangerOutline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger },
  gold:          { backgroundColor: colors.gold },
});

const PRESSED = StyleSheet.create({
  primary:       { backgroundColor: colors.primaryPressed },
  secondary:     { backgroundColor: colors.borderSoft },
  ghost:         { backgroundColor: colors.primarySoft },
  danger:        { opacity: 0.85 },
  dangerOutline: { backgroundColor: colors.dangerSoft },
  gold:          { backgroundColor: colors.goldDeep },
});

// Opt-in density only; never applied when `density` is omitted.
export const DENSITY = StyleSheet.create({
  child: { minHeight: sizes.childButton, borderRadius: radius.control },
  adult: { minHeight: sizes.adultButton, borderRadius: radius.control },
});

// Child tactile edge: only the filled brand / reward actions get depth.
export const CHILD_EDGE: Partial<Record<AppButtonVariant, ViewStyle>> = {
  primary: depth.childButton,
  gold:    depth.goldButton,
};

const styles = StyleSheet.create({
  base: {
    minHeight:         sizes.tapTarget,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.sm,
    alignItems:        'center',
    justifyContent:    'center',
  },
  compact: {
    minHeight:         40,
    paddingHorizontal: spacing.md,
  },
  compactDense: {
    minHeight:         sizes.tapTarget,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing.sm,
  },
  label: {
    ...typography.button,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});

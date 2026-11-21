import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, sizes } from '@/theme';

type Props = {
  icon:               keyof typeof Ionicons.glyphMap;
  // Required — an icon-only control must always be named for TalkBack.
  accessibilityLabel: string;
  onPress:            () => void;
  disabled?:          boolean;
  tone?:              'neutral' | 'onDark';
  size?:              number;
};

export function IconButton({ icon, accessibilityLabel, onPress, disabled = false, tone = 'neutral', size = 22 }: Props) {
  const color = tone === 'onDark' ? colors.textOnColor : colors.textPrimary;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        tone === 'onDark' ? styles.onDark : styles.neutral,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width:          sizes.iconButton,
    height:         sizes.iconButton,
    borderRadius:   radius.pill,
    alignItems:     'center',
    justifyContent: 'center',
  },
  neutral: { backgroundColor: colors.surfaceMuted },
  onDark:  { backgroundColor: colors.scrim },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});

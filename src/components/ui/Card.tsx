import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, depth, radius, shadows, spacing, type Density } from '@/theme';

type Props = {
  children: React.ReactNode;
  style?:   StyleProp<ViewStyle>;
  // Highlight for items that need the viewer's attention.
  accent?:  'none' | 'warning' | 'primary';
  // Locked design intensity. Omitted = legacy card, unchanged.
  //   child: radius 20, no border, 4dp indigo depth edge, no blur shadow
  //   adult: radius 14, 1px hairline, no decorative shadow
  density?: Density;
};

// The single card surface used by lists, settings rows and forms.
export function Card({ children, style, accent = 'none', density }: Props) {
  return (
    <View
      style={[
        styles.card,
        density ? CARD_DENSITY[density] : null,
        accent === 'warning' && styles.warning,
        accent === 'primary' && styles.primary,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.borderSoft,
    padding:         spacing.lg,
    ...shadows.card,
  },
  warning: {
    borderColor:     colors.warningBorder,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  primary: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
});

// Opt-in density only; never applied when `density` is omitted.
export const CARD_DENSITY = StyleSheet.create({
  child: {
    borderRadius: radius.childCard,
    borderWidth:  0,
    ...shadows.none,
    ...depth.childCard,
  },
  adult: {
    borderRadius: radius.control,
    borderWidth:  1,
    borderColor:  colors.border,
    ...shadows.none,
  },
});

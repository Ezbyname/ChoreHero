import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { colors, spacing, typography } from '@/theme';

type Props = {
  title:          string;
  subtitle?:      string | null;
  onClose:        () => void;
  closeLabel:     string;
  closeDisabled?: boolean;
};

// Top of every bottom sheet: title (+ optional subtitle) and an always
// visible X. It sits outside the scrolling body, so a tall photo can never
// push the way out of the sheet off screen.
export function SheetHeader({ title, subtitle, onClose, closeLabel, closeDisabled = false }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <IconButton icon="close" accessibilityLabel={closeLabel} onPress={onClose} disabled={closeDisabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           spacing.md,
  },
  texts: {
    flex: 1,
    gap:  2,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
});

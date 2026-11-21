import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  title:  string;
  count?: number;
  hint?:  string | null;
};

// One heading style for every list section on every tab.
export function SectionHeader({ title, count, hint }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {count !== undefined && count > 0 ? (
          <View style={styles.count} accessible accessibilityLabel={`${count}`}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        ) : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
    gap:          2,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  title: {
    ...typography.section,
    color: colors.textPrimary,
  },
  count: {
    minWidth:          24,
    paddingHorizontal: 6,
    borderRadius:      radius.pill,
    backgroundColor:   colors.primary,
    alignItems:        'center',
  },
  countText: {
    ...typography.label,
    color: colors.textOnColor,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

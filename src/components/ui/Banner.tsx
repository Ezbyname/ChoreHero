import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TONES, type StatusTone } from '@/components/ui/StatusPill';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  text:   string;
  title?: string;
  tone?:  StatusTone;
};

const ICONS: Record<StatusTone, keyof typeof Ionicons.glyphMap> = {
  neutral: 'information-circle-outline',
  primary: 'information-circle-outline',
  info:    'information-circle-outline',
  success: 'checkmark-circle',
  warning: 'time-outline',
  danger:  'alert-circle',
};

// Inline feedback block (success / error / waiting / info). Announced by
// screen readers; errors as alerts.
export function Banner({ text, title, tone = 'info' }: Props) {
  const t = TONES[tone];
  return (
    <View
      style={[styles.box, { backgroundColor: t.bg }]}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion="polite">
      <Ionicons name={ICONS[tone]} size={20} color={t.fg} style={styles.icon} />
      <View style={styles.texts}>
        {title ? <Text style={[styles.title, { color: t.fg }]}>{title}</Text> : null}
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               spacing.sm,
    borderRadius:      radius.md,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.md,
  },
  icon: {
    marginTop: 1,
  },
  texts: {
    flex: 1,
    gap:  2,
  },
  title: {
    ...typography.bodyStrong,
  },
  text: {
    ...typography.body,
    color: colors.textPrimary,
  },
});

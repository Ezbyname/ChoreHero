import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

export type StatusTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';

// Locked semantic statuses (Board 14). Each one ALWAYS renders an icon plus
// text — colour is never the only signal. Sent back is indigo, not red;
// gold is reserved for Points.
export type SemanticStatus = 'done' | 'waiting' | 'sentBack' | 'error' | 'points';

type Props = {
  label: string;
  tone?: StatusTone;
  icon?: keyof typeof Ionicons.glyphMap;
  // Opt-in semantic status. When set it supplies colours + a default icon
  // (an explicit `icon` still wins) and lets the label wrap instead of
  // clipping at large font scales. Omitted = legacy tone pill, unchanged.
  status?: SemanticStatus;
  accessibilityLabel?: string;
};

export function StatusPill({ label, tone = 'neutral', icon, status, accessibilityLabel }: Props) {
  if (status) {
    const s = SEMANTIC_STATUS[status];
    return (
      <View
        style={[styles.pill, styles.semanticPill, { backgroundColor: s.bg }]}
        accessible
        accessibilityLabel={accessibilityLabel ?? label}>
        <Ionicons name={icon ?? s.icon} size={13} color={s.fg} />
        <Text style={[styles.text, styles.semanticText, { color: s.fg }]}>{label}</Text>
      </View>
    );
  }
  const t = TONES[tone];
  return (
    <View
      style={[styles.pill, { backgroundColor: t.bg }]}
      accessible
      accessibilityLabel={accessibilityLabel ?? label}>
      {icon ? <Ionicons name={icon} size={13} color={t.fg} /> : null}
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export const TONES: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
  primary: { bg: colors.primarySoft,  fg: colors.primary },
  info:    { bg: colors.infoSoft,     fg: colors.info },
  success: { bg: colors.successSoft,  fg: colors.success },
  warning: { bg: colors.warningSoft,  fg: colors.warning },
  danger:  { bg: colors.dangerSoft,   fg: colors.danger },
};

export const SEMANTIC_STATUS: Record<SemanticStatus, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  done:     { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' },
  waiting:  { bg: colors.waitingSoft, fg: colors.waiting, icon: 'time-outline' },
  sentBack: { bg: colors.indigoTint,  fg: colors.indigo,  icon: 'refresh' },
  error:    { bg: colors.errorSoft,   fg: colors.error,   icon: 'alert-circle' },
  points:   { bg: colors.gold,        fg: colors.onGold,  icon: 'star' },
};

const styles = StyleSheet.create({
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    alignSelf:         'flex-start',
    gap:               4,
    borderRadius:      radius.pill,
    paddingVertical:   3,
    paddingHorizontal: spacing.sm,
  },
  text: {
    ...typography.label,
  },
  // Large-font safe: the pill may grow to two lines and never exceeds its
  // container; the chip radius keeps a wrapped pill looking intentional.
  semanticPill: {
    maxWidth:     '100%',
    borderRadius: radius.chip,
  },
  semanticText: {
    flexShrink: 1,
  },
});

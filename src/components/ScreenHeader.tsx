import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatQaBadgeText, runtimeBuildInfo } from '@/lib/runtimeBuildInfo';
import { colors, spacing, typography } from '@/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
}

// QA-01 — Runtime Build Identification, Layer A (quick identification).
// ScreenHeader is the one component every tab screen already renders, so
// reusing it here — rather than wrapping AppBootstrap or introducing a
// new overlay layer — is the smallest safe presentation seam: purely
// additive text, no touch handling, no effect on layout of anything below
// it, no effect on navigation/auth/startup. Full diagnostics stay in
// Settings → About; this is identification only. Never shown outside QA
// (runtimeBuildInfo.appVariant is only ever 'qa' for an actual QA-variant
// build — see config/appVariant.ts).
function QaBadge() {
  if (runtimeBuildInfo.appVariant !== 'qa') return null;

  return (
    <View style={styles.qaBadge}>
      <Text style={styles.qaBadgeText}>{formatQaBadgeText(runtimeBuildInfo)}</Text>
    </View>
  );
}

export function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <QaBadge />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
  paddingHorizontal: spacing.xl,
  paddingTop:        spacing.lg,
  paddingBottom:     spacing.md,
},
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.subtitle,
    color:     colors.textSecondary,
    marginTop: spacing.xs,
  },
  qaBadge: {
    alignSelf:         'flex-start',
    backgroundColor:   '#FEF3C7',
    borderRadius:      999,
    paddingHorizontal: spacing.sm,
    paddingVertical:   2,
    marginBottom:      spacing.xs,
  },
  qaBadgeText: {
    ...typography.caption,
    color:         '#92400E',
    fontWeight:    '700',
    letterSpacing: 0.3,
  },
});

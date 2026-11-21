import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { currentBuildInfo } from '@/lib/currentBuildInfo';
import { formatQaBadgeText } from '@/lib/runtimeBuildInfo';
import { colors, spacing, typography } from '@/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  // Optional slots (Slice 4 navigation entry points). Omitted means the
  // header renders exactly as before.
  trailing?: React.ReactNode;   // right of the title, e.g. the adult Home profile entry
  accessory?: React.ReactNode;  // under the subtitle, e.g. the adult Tasks view switch
}

// QA-01 — Runtime Build Identification, Layer A (quick identification).
// ScreenHeader is the one component every tab screen already renders, so
// reusing it here — rather than wrapping AppBootstrap or introducing a
// new overlay layer — is the smallest safe presentation seam: purely
// additive text, no touch handling, no effect on layout of anything below
// it, no effect on navigation/auth/startup. Full diagnostics stay in
// Settings → About; this is identification only. Never shown outside QA
// (currentBuildInfo.appVariant is only ever 'qa' for an actual QA-variant
// build — see config/appVariant.ts).
function QaBadge() {
  if (currentBuildInfo.appVariant !== 'qa') return null;

  return (
    <View style={styles.qaBadge}>
      <Text style={styles.qaBadgeText}>{formatQaBadgeText(currentBuildInfo)}</Text>
    </View>
  );
}

export function ScreenHeader({ title, subtitle, trailing, accessory }: ScreenHeaderProps) {
  const titleBlock = (
    <>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </>
  );
  return (
    <View style={styles.container}>
      <QaBadge />
      {trailing ? (
        <View style={styles.row}>
          <View style={styles.flex}>{titleBlock}</View>
          {trailing}
        </View>
      ) : titleBlock}
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop:        spacing.lg,
    paddingBottom:     spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
  },
  flex: {
    flex: 1,
  },
  accessory: {
    marginTop: spacing.md,
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
    backgroundColor:   colors.warningSoft,
    borderRadius:      999,
    paddingHorizontal: spacing.sm,
    paddingVertical:   2,
    marginBottom:      spacing.xs,
  },
  qaBadgeText: {
    ...typography.caption,
    color:         colors.warning,
    fontWeight:    '700',
    letterSpacing: 0.3,
  },
});

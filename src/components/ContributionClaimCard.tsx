import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { copy } from '@/content/copy';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import type { ContributionClaim } from '@/types';

interface ContributionClaimCardProps {
  claim:        ContributionClaim;
  claimantName: string | undefined;
  children?:    React.ReactNode; // review actions (approve/reject), rendered by the caller
}

export function ContributionClaimCard({ claim, claimantName, children }: ContributionClaimCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{copy.contributionClaims.pendingBadge}</Text>
      </View>

      <Text style={styles.title} numberOfLines={2}>{claim.title}</Text>

      <View style={styles.meta}>
        <Text style={styles.claimant}>{claimantName ?? '—'}</Text>
        {claim.points > 0 && (
          <Text style={styles.points}>{claim.points} {copy.taskCard.points}</Text>
        )}
      </View>

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
    marginBottom:    spacing.md,
    ...shadows.card,
  },
  badge: {
    alignSelf:       'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius:    radius.pill,
    paddingVertical:   2,
    paddingHorizontal: spacing.sm,
    marginBottom:    spacing.sm,
  },
  badgeText: {
    ...typography.caption,
    color:      colors.primary,
    fontWeight: '600',
  },
  title: {
    ...typography.body,
    color:        colors.textPrimary,
    fontWeight:   '500',
    marginBottom: spacing.sm,
  },
  meta: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  claimant: {
    ...typography.caption,
    color: colors.textSecondary,
    flex:  1,
  },
  points: {
    ...typography.caption,
    color:      colors.primary,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
});

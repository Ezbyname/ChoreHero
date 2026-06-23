import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { copy } from '@/content/copy';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import type { PointsBalance, Reward } from '@/types';

interface RewardCardProps {
  reward:         Reward;
  pointsBalance:  PointsBalance;
  memberName:     string;
}

export function RewardCard({ reward, pointsBalance, memberName }: RewardCardProps) {
  const { balance }        = pointsBalance;
  const { requiredPoints } = reward;
  const canRedeem          = balance >= requiredPoints;
  const remaining          = requiredPoints - balance;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{reward.title}</Text>

      {reward.description ? (
        <Text style={styles.description}>{reward.description}</Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.pointsNeeded}>
          {copy.rewards.pointsNeeded.replace('{n}', String(requiredPoints))}
        </Text>

        <View style={[styles.badge, canRedeem ? styles.badgeReady : styles.badgePending]}>
          <Text style={[styles.badgeText, canRedeem ? styles.badgeTextReady : styles.badgeTextPending]}>
            {canRedeem
              ? copy.rewards.availableNow
              : copy.rewards.morePointsToGo.replace('{n}', String(remaining))}
          </Text>
        </View>
      </View>

      <Text style={styles.memberHint}>
        {copy.rewards.memberHasPoints
          .replace('{name}', memberName)
          .replace('{n}', String(balance))}
      </Text>
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
  title: {
    ...typography.body,
    color:        colors.textPrimary,
    fontWeight:   '600',
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.caption,
    color:        colors.textSecondary,
    marginBottom: spacing.sm,
  },
  footer: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   spacing.xs,
  },
  pointsNeeded: {
    ...typography.caption,
    color: colors.textMuted,
  },
  badge: {
    borderRadius:      radius.pill,
    paddingVertical:   3,
    paddingHorizontal: spacing.sm,
  },
  badgeReady: {
    backgroundColor: colors.success,
  },
  badgePending: {
    backgroundColor: colors.primarySoft,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  badgeTextReady: {
    color: '#065F46',
  },
  badgeTextPending: {
    color: colors.primary,
  },
  memberHint: {
    ...typography.caption,
    color:     colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
});

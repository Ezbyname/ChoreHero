import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { copy } from '@/content/copy';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';

const ACTION_LABELS: Record<ActivityAction, string> = {
  complete: copy.activityCard.completeAction,
  approve:  copy.contributionClaims.approveButton,
  decline:  copy.contributionClaims.rejectButton,
};

interface ActivityCardProps {
  activity:            FamilyActivity;
  personName?:         string;
  personAvatarUrl?:    string;
  personAvatarEmoji?:  string;
  // True only for an unassigned task — drives the same muted/italic,
  // no-avatar treatment TaskCard used to render for that one case.
  isPersonUnassigned?: boolean;
  // Actions only render when a handler is supplied — a kind whose
  // availableActions aren't wired up yet (e.g. tasks, pre-completion-feature)
  // simply shows no buttons instead of a dead one.
  onAction?:           (action: ActivityAction) => void;
  isActionPending?:    boolean;
}

export function ActivityCard({
  activity,
  personName,
  personAvatarUrl,
  personAvatarEmoji,
  isPersonUnassigned,
  onAction,
  isActionPending,
}: ActivityCardProps) {
  const isNeedsAttention = activity.status === 'needs_attention';
  const showKindBadge    = activity.kind !== 'task' || isNeedsAttention;
  const badgeText        = isNeedsAttention ? copy.taskCard.needsAttention : copy.activityKinds[activity.kind];
  const actions          = onAction ? activity.availableActions : [];

  return (
    <View style={[styles.card, isNeedsAttention && styles.cardAttention]}>
      {showKindBadge && (
        <View style={[styles.badge, isNeedsAttention && styles.badgeAttention]}>
          <Text style={[styles.badgeText, isNeedsAttention && styles.badgeTextAttention]}>
            {badgeText}
          </Text>
        </View>
      )}

      <Text style={styles.title} numberOfLines={2}>{activity.title}</Text>

      <View style={styles.meta}>
        {personName && (
          <View style={styles.personRow}>
            {!isPersonUnassigned && (
              <FamilyAvatar
                name={personName}
                avatarUrl={personAvatarUrl}
                avatarEmoji={personAvatarEmoji}
                size={20}
              />
            )}
            <Text style={[styles.person, isPersonUnassigned && styles.personUnassigned]}>
              {personName}
            </Text>
          </View>
        )}

        {activity.points != null && activity.points > 0 && (
          <Text style={styles.points}>{activity.points} {copy.taskCard.points}</Text>
        )}
      </View>

      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((action) => {
            const isSecondary = action === 'decline';
            return (
              <TouchableOpacity
                key={action}
                style={[styles.actionButton, isSecondary ? styles.actionButtonSecondary : styles.actionButtonPrimary]}
                onPress={() => onAction?.(action)}
                disabled={isActionPending}
                activeOpacity={0.8}
              >
                {isActionPending ? (
                  <ActivityIndicator size="small" color={isSecondary ? colors.textSecondary : colors.surface} />
                ) : (
                  <Text style={[styles.actionButtonText, isSecondary ? styles.actionButtonTextSecondary : styles.actionButtonTextPrimary]}>
                    {ACTION_LABELS[action]}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
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
  cardAttention: {
    borderColor:     colors.warning,
    backgroundColor: colors.warningSoft,
  },
  badge: {
    alignSelf:         'flex-start',
    backgroundColor:   colors.primarySoft,
    borderRadius:      radius.pill,
    paddingVertical:   2,
    paddingHorizontal: spacing.sm,
    marginBottom:      spacing.sm,
  },
  badgeAttention: {
    backgroundColor: colors.warning,
  },
  badgeText: {
    ...typography.caption,
    color:      colors.primary,
    fontWeight: '600',
  },
  badgeTextAttention: {
    color: colors.surface,
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
  personRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    flex:          1,
  },
  person: {
    ...typography.caption,
    color: colors.textSecondary,
    flex:  1,
  },
  personUnassigned: {
    color:     colors.textMuted,
    fontStyle: 'italic',
  },
  points: {
    ...typography.caption,
    color:      colors.primary,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginTop:     spacing.md,
  },
  actionButton: {
    flex:            1,
    borderRadius:    radius.md,
    paddingVertical: spacing.sm,
    alignItems:      'center',
    justifyContent:  'center',
  },
  actionButtonSecondary: {
    backgroundColor: colors.background,
    borderWidth:     1,
    borderColor:     colors.borderSoft,
  },
  actionButtonPrimary: {
    backgroundColor: colors.primary,
  },
  actionButtonText: {
    ...typography.caption,
    fontWeight: '600',
  },
  actionButtonTextSecondary: {
    color: colors.textSecondary,
  },
  actionButtonTextPrimary: {
    color: colors.surface,
  },
});

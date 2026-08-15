import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { copy } from '@/content/copy';
import { formatDueDate } from '@/domain/dateFormat';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';

const DESCRIPTION_MAX_LINES = 2; // P2-D07

// P2-D07: the expansion control must appear only when the description
// actually exceeds DESCRIPTION_MAX_LINES rendered lines — not merely
// whenever a description exists. A hidden "measurer" Text renders the
// full, unclipped description off-screen to get the true line count via
// onTextLayout; numberOfLines is deliberately never applied to it, since
// RN clips the layout (and therefore the reported line count) at the
// native level before onTextLayout fires — measuring the already-clipped
// Text would always report <= DESCRIPTION_MAX_LINES and defeat the check.
// Isolated in its own component (rather than inline in ActivityCard) so
// its state resets correctly via React's own remount-on-key-change
// whenever the description text changes, without hand-rolled reset logic
// scattered through the parent.
function DescriptionBlock({ description }: { description: string }) {
  const [isExpanded, setIsExpanded]       = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  return (
    <View style={styles.descriptionBlock}>
      <Text
        style={[styles.description, styles.measurer]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onTextLayout={(e) => setIsOverflowing(e.nativeEvent.lines.length > DESCRIPTION_MAX_LINES)}
      >
        {description}
      </Text>
      <Text
        style={styles.description}
        numberOfLines={isExpanded ? undefined : DESCRIPTION_MAX_LINES}
      >
        {description}
      </Text>
      {isOverflowing && (
        <TouchableOpacity onPress={() => setIsExpanded((v) => !v)} activeOpacity={0.7}>
          <Text style={styles.showMoreText}>
            {isExpanded ? copy.taskCard.showLess : copy.taskCard.showMore}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const ACTION_LABELS: Record<ActivityAction, string> = {
  claim:    copy.activityCard.claimAction,
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

  // P2-D06: computed at render time so relative labels ("Today"/"Tomorrow")
  // stay correct as time passes without needing a subscription.
  const dueDateInfo = activity.dueAt != null
    ? formatDueDate(activity.dueAt, activity.dueAtHasTime)
    : null;

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

      {activity.description != null && activity.description !== '' && (
        // key={activity.description}: guarantees a fresh isExpanded/
        // isOverflowing state if this same card instance ever renders a
        // different description (defensive; in practice ActivityList's
        // key={activity.id} already remounts the whole card per task).
        <DescriptionBlock key={activity.description} description={activity.description} />
      )}

      {dueDateInfo && (
        <Text style={styles.dueDate}>
          {dueDateInfo.dateLabel}{dueDateInfo.timeLabel ? ` · ${dueDateInfo.timeLabel}` : ''}
        </Text>
      )}

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
  descriptionBlock: {
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  // Off-screen measurement pass — see DescriptionBlock's comment. Must not
  // affect visible layout or intercept touches.
  measurer: {
    position: 'absolute',
    left:     0,
    right:    0,
    opacity:  0,
  },
  showMoreText: {
    ...typography.caption,
    color:      colors.primary,
    fontWeight: '600',
    marginTop:  2,
  },
  dueDate: {
    ...typography.caption,
    color:        colors.textMuted,
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

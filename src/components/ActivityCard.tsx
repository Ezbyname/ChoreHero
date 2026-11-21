import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { StatusPill, type StatusTone } from '@/components/ui/StatusPill';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { formatDueDate } from '@/domain/dateFormat';
import { colors, spacing, typography } from '@/theme';
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
        <TouchableOpacity onPress={() => setIsExpanded((v) => !v)} activeOpacity={0.7} hitSlop={8}>
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
  manage_completion: copy.activityCard.manageCompletionAction,
};

// Screen-supplied extras that are not part of the activity itself.
export type ActivityCardDecorations = {
  // Explicit status for this card (e.g. Assigned). Overrides the default
  // kind / needs-attention pill.
  status?:     { label: string; tone: StatusTone };
  // Evidence photo count of a pending completion (reviewer cards). From
  // submission metadata only — no image bytes are loaded for it.
  photoCount?: number;
};

interface ActivityCardProps {
  activity:            FamilyActivity;
  personName?:         string;
  personAvatarUrl?:    string;
  personAvatarEmoji?:  string;
  // True only for an unassigned task — muted/italic, no avatar.
  isPersonUnassigned?: boolean;
  // Actions only render when a handler is supplied.
  onAction?:           (action: ActivityAction) => void;
  isActionPending?:    boolean;
  decorations?:        ActivityCardDecorations;
}

function photoCountLabel(count: number): string {
  return count === 0 ? copy.taskCard.noPhotoA11y
    : count === 1 ? copy.taskCard.photoCountOneA11y
    : formatCopy(copy.taskCard.photoCountA11y, { n: count });
}

export function ActivityCard({
  activity,
  personName,
  personAvatarUrl,
  personAvatarEmoji,
  isPersonUnassigned,
  onAction,
  isActionPending,
  decorations,
}: ActivityCardProps) {
  const isNeedsAttention = activity.status === 'needs_attention';
  const actions          = onAction ? activity.availableActions : [];

  const status = decorations?.status
    ?? (isNeedsAttention
      ? { label: copy.taskCard.waitingForReview, tone: 'warning' as const }
      : activity.kind !== 'task'
        ? { label: copy.activityKinds[activity.kind], tone: 'primary' as const }
        : null);

  // P2-D06: computed at render time so relative labels ("Today"/"Tomorrow")
  // stay correct as time passes without needing a subscription.
  const dueDateInfo = activity.dueAt != null
    ? formatDueDate(activity.dueAt, activity.dueAtHasTime)
    : null;
  const photoCount = decorations?.photoCount;

  return (
    <Card accent={isNeedsAttention ? 'warning' : 'none'} style={styles.card}>
      {(status || photoCount !== undefined) && (
        <View style={styles.topRow}>
          {status ? <StatusPill label={status.label} tone={status.tone} /> : <View />}
          {photoCount !== undefined && (
            <StatusPill
              label={photoCount === 0 ? copy.taskCard.noPhotoA11y : `📷 ${photoCount}`}
              tone={photoCount === 0 ? 'neutral' : 'info'}
              accessibilityLabel={photoCountLabel(photoCount)}
            />
          )}
        </View>
      )}

      <Text style={styles.title} numberOfLines={2}>{activity.title}</Text>

      {activity.description != null && activity.description !== '' && (
        // key={activity.description}: fresh expand state if this same card
        // instance ever renders a different description.
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
                size={24}
              />
            )}
            <Text style={[styles.person, isPersonUnassigned && styles.personUnassigned]} numberOfLines={1}>
              {personName}
            </Text>
          </View>
        )}

        {activity.points != null && activity.points > 0 && (
          <Text style={styles.points}>⭐ {activity.points} {copy.taskCard.points}</Text>
        )}
      </View>

      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((action) => (
            <AppButton
              key={action}
              label={ACTION_LABELS[action]}
              variant={action === 'decline' ? 'secondary' : 'primary'}
              compact
              busy={isActionPending}
              onPress={() => onAction?.(action)}
              style={styles.action}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    gap:          spacing.sm,
  },
  topRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    gap:            spacing.sm,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  descriptionBlock: {
    gap: 2,
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
    ...typography.label,
    color:     colors.primary,
    marginTop: 2,
  },
  dueDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  meta: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    gap:            spacing.sm,
  },
  personRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
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
    ...typography.label,
    color: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginTop:     spacing.xs,
  },
  action: {
    flex: 1,
  },
});

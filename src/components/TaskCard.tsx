import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { copy } from '@/content/copy';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import type { Task } from '@/types';

interface TaskCardProps {
  task:                Task;
  assigneeName:        string | undefined;
  assigneeAvatarUrl?:   string;
  assigneeAvatarEmoji?: string;
}

export function TaskCard({ task, assigneeName, assigneeAvatarUrl, assigneeAvatarEmoji }: TaskCardProps) {
  const isUnassigned     = !task.assigneeId;
  const isNeedsAttention = task.status === 'needs_attention';

  const displayName = isUnassigned
    ? copy.taskCard.unassigned
    : (assigneeName ?? '—');

  return (
    <View style={[styles.card, isNeedsAttention && styles.cardAttention]}>
      {isNeedsAttention && (
        <View style={styles.attentionBadge}>
          <Text style={styles.attentionText}>{copy.taskCard.needsAttention}</Text>
        </View>
      )}

      <Text style={styles.title} numberOfLines={2}>{task.title}</Text>

      <View style={styles.meta}>
        <View style={styles.assigneeRow}>
          {!isUnassigned && (
            <FamilyAvatar
              name={displayName}
              avatarUrl={assigneeAvatarUrl}
              avatarEmoji={assigneeAvatarEmoji}
              size={20}
            />
          )}
          <Text style={[styles.assignee, isUnassigned && styles.assigneeUnset]}>
            {displayName}
          </Text>
        </View>

        {task.points != null && task.points > 0 && (
          <Text style={styles.points}>{task.points} {copy.taskCard.points}</Text>
        )}
      </View>
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
  attentionBadge: {
    alignSelf:       'flex-start',
    backgroundColor: colors.warning,
    borderRadius:    radius.pill,
    paddingVertical:   2,
    paddingHorizontal: spacing.sm,
    marginBottom:    spacing.sm,
  },
  attentionText: {
    ...typography.caption,
    color:      colors.surface,
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
  assigneeRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    flex:          1,
  },
  assignee: {
    ...typography.caption,
    color: colors.textSecondary,
    flex:  1,
  },
  assigneeUnset: {
    color:      colors.textMuted,
    fontStyle:  'italic',
  },
  points: {
    ...typography.caption,
    color:      colors.primary,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
});

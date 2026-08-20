import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { ActivityList } from '@/components/ActivityList';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { TaskAdapter } from '@/domain/adapters';
import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';
import { claimOpenTask } from '@/features/tasks/claimOpenTask';
import { completeTask } from '@/features/tasks/completeTask';
import { requestTaskCompletion } from '@/features/tasks/requestTaskCompletion';
import { getTasksForUser } from '@/features/tasks/taskFilters';
import { useAppStore } from '@/store/useAppStore';
import {
  selectCanApproveTaskCompletion,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectTasks,
} from '@/store/selectors';
import { colors, spacing, typography } from '@/theme';

export function MyTasksScreen() {
  const tasks     = useAppStore(selectTasks);
  const user      = useAppStore(selectCurrentUser);
  const household = useAppStore(selectCurrentHousehold);
  const role      = useAppStore(selectCurrentMemberRole);
  const canApproveTaskCompletion = useAppStore(selectCanApproveTaskCompletion);
  const members   = household?.members ?? [];

  const myTasks = useMemo(
    () => (user ? getTasksForUser(tasks, user.id) : []),
    [tasks, user],
  );

  // Mirrors TodayScreen's own filter: a needs_attention task assigned to
  // the current user is their OWN pending submission here, never someone
  // else's — approve/decline must never show to a non-privileged viewer
  // of their own submission (a child cannot approve their own work).
  const myActivities = useMemo(
    () => myTasks.map(TaskAdapter.toFamilyActivity).map((activity) =>
      canApproveTaskCompletion
        ? activity
        : { ...activity, availableActions: activity.availableActions.filter((a) => a !== 'approve' && a !== 'decline') },
    ),
    [myTasks, canApproveTaskCompletion],
  );

  const [pendingActivityId, setPendingActivityId] = useState<string | null>(null);
  const [feedback, setFeedback]                   = useState<string | null>(null);

  // 'claim'/'complete' branching mirrors TodayScreen's handleTaskAction —
  // see that function's own comment for why 'complete' routes by role
  // (child -> requestTaskCompletion, privileged -> completeTask). 'claim'
  // is included for the same defensive/consistency reasons even though a
  // task already assigned to this user (which is everything on this
  // screen) never actually produces a 'claim' action from the adapter.
  async function handleTaskAction(activity: FamilyActivity, action: ActivityAction) {
    if (pendingActivityId || !household || !user) return;
    if (action !== 'claim' && action !== 'complete') return;

    setPendingActivityId(activity.id);
    setFeedback(null);

    if (action === 'claim') {
      const result = await claimOpenTask({
        taskId:      activity.id,
        householdId: household.id,
        profileId:   user.id,
        role,
      });

      if (!result.ok) {
        setFeedback(
          result.reason === 'already_claimed'
            ? copy.activityCard.alreadyClaimed
            : copy.activityCard.claimError,
        );
      }
    } else if (role === 'child') {
      const result = await requestTaskCompletion({
        taskId:      activity.id,
        householdId: household.id,
        profileId:   user.id,
        role,
      });

      if (!result.ok) {
        setFeedback(
          result.reason === 'not_authorized'
            ? copy.activityCard.requestNotAllowed
            : result.reason === 'not_open'
              ? copy.activityCard.requestNotOpen
              : copy.activityCard.requestError,
        );
      }
    } else {
      const result = await completeTask({
        taskId:      activity.id,
        householdId: household.id,
        role,
      });

      if (!result.ok) {
        setFeedback(
          result.reason === 'not_authorized'
            ? copy.activityCard.completeNotAllowed
            : result.reason === 'not_open'
              ? copy.activityCard.completeNotOpen
              : copy.activityCard.completeError,
        );
      }
    }

    setPendingActivityId(null);
  }

  return (
    <Screen style={styles.screen}>
      <ScreenHeader
        title={copy.screens.myTasks.title}
        subtitle={copy.screens.myTasks.subtitle}
      />

      {myTasks.length === 0 ? (
        <EmptyState message={copy.emptyStates.myTasks} emoji="✅" />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          <Text style={styles.summary}>{copy.myTasks.summary}</Text>

          <ActivityList
            activities={myActivities}
            members={members}
            onAction={handleTaskAction}
            pendingActivityId={pendingActivityId}
          />
          {feedback && <Text style={styles.feedback}>{feedback}</Text>}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom:     spacing.xxxl,
  },
  summary: {
    ...typography.body,
    color:        colors.textSecondary,
    marginBottom: spacing.lg,
  },
  feedback: {
    ...typography.caption,
    color:     colors.textMuted,
    marginTop: spacing.sm,
  },
});

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TaskCard } from '@/components/TaskCard';
import { copy } from '@/content/copy';
import { getMemberByUserId, getMemberNameByUserId } from '@/features/household/householdUtils';
import { getTasksForUser } from '@/features/tasks/taskFilters';
import { useAppStore } from '@/store/useAppStore';
import {
  selectCurrentHousehold,
  selectCurrentUser,
  selectTasks,
} from '@/store/selectors';
import { colors, spacing, typography } from '@/theme';

export function MyTasksScreen() {
  const tasks     = useAppStore(selectTasks);
  const user      = useAppStore(selectCurrentUser);
  const household = useAppStore(selectCurrentHousehold);
  const members   = household?.members ?? [];

  const myTasks = useMemo(
    () => (user ? getTasksForUser(tasks, user.id) : []),
    [tasks, user],
  );

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

          {myTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assigneeName={getMemberNameByUserId(members, task.assigneeId)}
              assigneeAvatarUrl={getMemberByUserId(members, task.assigneeId)?.avatarUrl}
              assigneeAvatarEmoji={getMemberByUserId(members, task.assigneeId)?.avatarEmoji}
            />
          ))}
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
});

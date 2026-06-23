import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TaskCard } from '@/components/TaskCard';
import { copy } from '@/content/copy';
import { getTasksForUser } from '@/features/tasks/taskFilters';
import { mockCurrentUserId, mockHousehold, mockTasks } from '@/mock';
import { colors, spacing, typography } from '@/theme';
import type { HouseholdMember } from '@/types';

function getMemberName(
  members: HouseholdMember[],
  userId: string | undefined,
): string | undefined {
  if (!userId) return undefined;
  return members.find((m) => m.userId === userId)?.name;
}

export function MyTasksScreen() {
  const members  = mockHousehold.members;

  const myTasks = useMemo(
    () => getTasksForUser(mockTasks, mockCurrentUserId),
    [],
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
              assigneeName={getMemberName(members, task.assigneeId)}
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

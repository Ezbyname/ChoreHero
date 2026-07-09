import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { ActivityList } from '@/components/ActivityList';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { TaskAdapter } from '@/domain/adapters';
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
  const myActivities = useMemo(() => myTasks.map(TaskAdapter.toFamilyActivity), [myTasks]);

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

          <ActivityList activities={myActivities} members={members} />
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

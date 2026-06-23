import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TaskCard } from '@/components/TaskCard';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { mockHousehold, mockTasks } from '@/mock';
import { colors, spacing, typography } from '@/theme';
import type { HouseholdMember } from '@/types';

function isToday(isoString: string): boolean {
  const d   = new Date(isoString);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth() &&
    d.getDate()     === now.getDate()
  );
}

function getMemberName(
  members: HouseholdMember[],
  userId: string | undefined,
): string | undefined {
  if (!userId) return undefined;
  return members.find((m) => m.userId === userId)?.name;
}

export function TodayScreen() {
  const members = mockHousehold.members;

  const todayTasks = useMemo(() => {
    return mockTasks.filter((t) => {
      if (t.status === 'completed') return false;
      if (t.status === 'needs_attention') return true;
      if (!t.assigneeId && t.status === 'open') return true;
      if (t.dueAt && isToday(t.dueAt)) return true;
      return false;
    });
  }, []);

  const hasUnassigned = todayTasks.some((t) => !t.assigneeId);

  return (
    <Screen style={styles.screen}>
      <ScreenHeader
        title={copy.screens.today.title}
        subtitle={copy.screens.today.subtitle}
      />

      {todayTasks.length === 0 ? (
        <EmptyState message={copy.emptyStates.today} emoji="🌿" />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          <Text style={styles.summary}>{copy.today.summary}</Text>

          {hasUnassigned && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{copy.today.unassignedBanner}</Text>
            </View>
          )}

          {todayTasks.map((task) => (
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
  banner: {
    backgroundColor: colors.primarySoft,
    borderRadius:    12,
    padding:         spacing.md,
    marginBottom:    spacing.lg,
  },
  bannerText: {
    ...typography.caption,
    color: colors.primary,
  },
});

import React from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';

export function MyTasksScreen() {
  return (
    <Screen>
      <ScreenHeader
        title={copy.screens.myTasks.title}
        subtitle={copy.screens.myTasks.subtitle}
      />
      <EmptyState message={copy.emptyStates.myTasks} />
    </Screen>
  );
}

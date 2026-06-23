import React from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';

export function AssignedByMeScreen() {
  return (
    <Screen>
      <ScreenHeader
        title={copy.screens.assigned.title}
        subtitle={copy.screens.assigned.subtitle}
      />
      <EmptyState message={copy.emptyStates.assigned} />
    </Screen>
  );
}

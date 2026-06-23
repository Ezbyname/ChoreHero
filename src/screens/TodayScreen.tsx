import React from 'react';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { copy } from '../content/copy';

export function TodayScreen() {
  return (
    <Screen>
      <ScreenHeader
        title={copy.screens.today.title}
        subtitle={copy.screens.today.subtitle}
      />
      <EmptyState message={copy.emptyStates.today} />
    </Screen>
  );
}

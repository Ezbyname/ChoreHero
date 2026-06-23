import React from 'react';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { copy } from '../content/copy';

export function RewardsScreen() {
  return (
    <Screen>
      <ScreenHeader
        title={copy.screens.rewards.title}
        subtitle={copy.screens.rewards.subtitle}
      />
      <EmptyState message={copy.emptyStates.rewards} />
    </Screen>
  );
}

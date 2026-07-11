import React from 'react';
import { Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';

// TEMPORARY — bisection diagnostic only. Real TodayScreen body stripped out
// to determine whether the React error #185 render loop originates inside
// this screen's render tree or upstream of it (AppTabs / navigator /
// library internals). Restore from git history once the loop source is
// identified — this is not a real implementation.
export function TodayScreen() {
  return (
    <Screen>
      <ScreenHeader
        title={copy.screens.today.title}
        subtitle={copy.screens.today.subtitle}
      />
      <Text>bisection placeholder — if this renders without crashing, the loop is inside the real TodayScreen body</Text>
    </Screen>
  );
}

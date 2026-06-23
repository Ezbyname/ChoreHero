import React from 'react';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';

export function SettingsScreen() {
  return (
    <Screen>
      <ScreenHeader
        title={copy.screens.settings.title}
        subtitle={copy.screens.settings.subtitle}
      />
    </Screen>
  );
}

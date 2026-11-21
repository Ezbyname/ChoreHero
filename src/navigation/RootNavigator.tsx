import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { HouseholdLiveSync } from '@/features/sync/HouseholdLiveSync';
import { AppShell } from '@/navigation/AppTabs';

export function RootNavigator() {
  return (
    <NavigationContainer>
      <HouseholdLiveSync />
      {/* Role-based shell (Slice 4): child or adult tabs, plus adult Settings. */}
      <AppShell />
    </NavigationContainer>
  );
}

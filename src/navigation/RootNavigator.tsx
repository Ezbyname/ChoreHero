import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { AppTabs } from './AppTabs';

export function RootNavigator() {
  return (
    <NavigationContainer>
      <AppTabs />
    </NavigationContainer>
  );
}

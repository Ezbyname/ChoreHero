import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { AssignedByMeScreen } from '../screens/AssignedByMeScreen';
import { MyTasksScreen } from '../screens/MyTasksScreen';
import { RewardsScreen } from '../screens/RewardsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TodayScreen } from '../screens/TodayScreen';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F3F4F6',
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: '#6366F1',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen
        name="MyTasks"
        component={MyTasksScreen}
        options={{ title: 'My Tasks' }}
      />
      <Tab.Screen name="Assigned" component={AssignedByMeScreen} />
      <Tab.Screen name="Rewards" component={RewardsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

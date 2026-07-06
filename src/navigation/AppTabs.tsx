import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { AssignedByMeScreen } from '@/screens/AssignedByMeScreen';
import { MyTasksScreen } from '@/screens/MyTasksScreen';
import { RewardsScreen } from '@/screens/RewardsScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TodayScreen } from '@/screens/TodayScreen';
import { colors } from '@/theme';
import type { RootTabParamList } from '@/navigation/types';

const Tab = createBottomTabNavigator<RootTabParamList>();

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<keyof RootTabParamList, { active: IconName; inactive: IconName }> = {
  Today:    { active: 'sunny',        inactive: 'sunny-outline' },
  MyTasks:  { active: 'checkbox',     inactive: 'checkbox-outline' },
  Assigned: { active: 'people',       inactive: 'people-outline' },
  Rewards:  { active: 'gift',         inactive: 'gift-outline' },
  Settings: { active: 'settings',     inactive: 'settings-outline' },
};

function makeTabBarIcon(screen: keyof RootTabParamList) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <Ionicons name={focused ? TAB_ICONS[screen].active : TAB_ICONS[screen].inactive} size={size} color={color} />
  );
}

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor:  colors.borderSoft,
          elevation:       0,
          shadowOpacity:   0,
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen name="Today"    component={TodayScreen}        options={{ tabBarIcon: makeTabBarIcon('Today') }} />
      <Tab.Screen name="MyTasks"  component={MyTasksScreen}      options={{ title: 'My Tasks', tabBarIcon: makeTabBarIcon('MyTasks') }} />
      <Tab.Screen name="Assigned" component={AssignedByMeScreen} options={{ tabBarIcon: makeTabBarIcon('Assigned') }} />
      <Tab.Screen name="Rewards"  component={RewardsScreen}      options={{ tabBarIcon: makeTabBarIcon('Rewards') }} />
      <Tab.Screen name="Settings" component={SettingsScreen}     options={{ tabBarIcon: makeTabBarIcon('Settings') }} />
    </Tab.Navigator>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copy } from '@/content/copy';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import {
  DEFAULT_TAB,
  TAB_LABELS,
  resolveShellKind,
  settingsAudienceForShell,
  type ShellKind,
  type TabRoute,
} from '@/navigation/roleShell';
import { tabBarHeightFor } from '@/navigation/tabBarMetrics';
import type { AdultTabParamList, ChildTabParamList, RootStackParamList } from '@/navigation/types';
import type { AttentionItem, QuickActionKey } from '@/features/adultHome/adultHomeModel';
import { AdultHomeScreen } from '@/screens/AdultHomeScreen';
import { AdultReviewScreen } from '@/screens/AdultReviewScreen';
import { AdultRewardsScreen } from '@/screens/AdultRewardsScreen';
import { AdultTasksScreen } from '@/screens/AdultTasksScreen';
import { ChildHomeScreen } from '@/screens/ChildHomeScreen';
import { ChildMissionDetailsScreen } from '@/screens/ChildMissionDetailsScreen';
import { AdultFamilyScreen } from '@/screens/AdultFamilyScreen';
import { ChildMissionsScreen } from '@/screens/ChildMissionsScreen';
import { ChildRewardsScreen } from '@/screens/ChildRewardsScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { NewMissionScreen } from '@/screens/NewMissionScreen';
import { NewRewardScreen } from '@/screens/NewRewardScreen';
import { selectCurrentMemberRole } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors } from '@/theme';

// Slice 4: role-based navigation shell (navigation only, no visual
// facelift). The shell comes from the household permission set (see
// roleShell.ts):
//   - Child:                Home · Missions · Rewards · Me
//   - Adult / admin / owner: Home · Tasks · Rewards · Family, plus Settings
//     on the root stack, opened from the Home avatar or Family → Settings.
// Tab visibility is not authorization. Every screen still gates its own
// actions, and the backend stays authoritative.

const ChildTab = createBottomTabNavigator<ChildTabParamList>();
const AdultTab = createBottomTabNavigator<AdultTabParamList>();
const Stack    = createNativeStackNavigator<RootStackParamList>();

type IconName = keyof typeof Ionicons.glyphMap;

// The existing Ionicons family. The old Today/Rewards/Settings glyphs are
// reused where the meaning carries over.
export const TAB_ICONS: Record<TabRoute, { active: IconName; inactive: IconName }> = {
  Home:     { active: 'home',          inactive: 'home-outline' },
  Missions: { active: 'checkbox',      inactive: 'checkbox-outline' },
  Tasks:    { active: 'checkbox',      inactive: 'checkbox-outline' },
  Rewards:  { active: 'gift',          inactive: 'gift-outline' },
  Me:       { active: 'person-circle', inactive: 'person-circle-outline' },
  Family:   { active: 'people',        inactive: 'people-outline' },
};

function tabOptions(route: TabRoute): BottomTabNavigationOptions {
  return {
    title: TAB_LABELS[route],
    tabBarIcon: ({ focused, color, size }) => (
      <Ionicons name={focused ? TAB_ICONS[route].active : TAB_ICONS[route].inactive} size={size} color={color} />
    ),
  };
}

const SCREEN_OPTIONS: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor:  colors.border,
    elevation:       0,
    shadowOpacity:   0,
  },
  tabBarActiveTintColor:   colors.primary,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarLabelStyle: {
    fontSize:   12,
    fontWeight: '600',
  },
};

// Focus refresh: coming back to a tab refetches. The refetch is throttled
// and coalesced in householdRefresh.ts, so a screen never shows data that
// only a re-login would have fixed.
const SCREEN_LISTENERS = { focus: () => { requestHouseholdRefresh('focus'); } };

function ChildMeScreen() {
  return <SettingsScreen audience={settingsAudienceForShell('child')} />;
}

// A larger Android font size makes the tab labels taller than the fixed
// bar; the bar grows with them (tabBarMetrics.ts). Unchanged at 100%.
function useTabScreenOptions(): BottomTabNavigationOptions {
  const { fontScale } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const height = tabBarHeightFor(fontScale, bottom);
  return useMemo(
    () => (height === null ? SCREEN_OPTIONS : { ...SCREEN_OPTIONS, tabBarStyle: [SCREEN_OPTIONS.tabBarStyle, { height }] }),
    [height],
  );
}

// Slice 5C: Missions opens Mission Details on the root stack, above the
// tabs, so the detail is full screen with no tab bar. The screens stay
// navigation-free: the shell passes the callbacks in.
function ChildMissionsTab() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return <ChildMissionsScreen onOpenMission={(taskId) => navigation.navigate('MissionDetails', { taskId })} />;
}

function MissionDetailsRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'MissionDetails'>) {
  return <ChildMissionDetailsScreen taskId={route.params.taskId} onBack={() => navigation.goBack()} />;
}

function ChildTabs() {
  const screenOptions = useTabScreenOptions();
  return (
    <ChildTab.Navigator initialRouteName={DEFAULT_TAB} screenListeners={SCREEN_LISTENERS} screenOptions={screenOptions}>
      <ChildTab.Screen name="Home"     component={ChildHomeScreen} options={tabOptions('Home')} />
      <ChildTab.Screen name="Missions" component={ChildMissionsTab} options={tabOptions('Missions')} />
      <ChildTab.Screen name="Rewards"  component={ChildRewardsScreen} options={tabOptions('Rewards')} />
      <ChildTab.Screen name="Me"       component={ChildMeScreen} options={tabOptions('Me')} />
    </ChildTab.Navigator>
  );
}

// The adult Home avatar opens Settings (and so does Family -> Settings).
function useOpenSettings() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return () => navigation.navigate('Settings');
}

// Slice 6A: Adult Home (Board 06). The screen stays navigation-free; the
// shell routes each action to an existing flow:
//   - avatar       -> Settings (root stack, unchanged)
//   - Review       -> AdultReview (root stack): the existing review section
//                     for that one item
//   - New mission  -> NewMission (root stack): the existing Create mission
//                     form (Slice 6B; it was Tasks → Assigned in Slice 6A)
//   - New reward   -> NewReward (root stack): Create Reward (Slice 6C)
function AdultHomeTab() {
  const navigation = useNavigation<NavigationProp<RootStackParamList & AdultTabParamList>>();
  const openSettings = useOpenSettings();
  return (
    <AdultHomeScreen
      onOpenSettings={openSettings}
      onReview={(item: AttentionItem) => navigation.navigate('AdultReview', { kind: item.kind, id: item.id })}
      onQuickAction={(key: QuickActionKey) => {
        if (key === 'new_mission') navigation.navigate('NewMission');
        else navigation.navigate('NewReward');
      }}
    />
  );
}

// Slice 6B: Adult Tasks (Board 07). Waiting rows' "Review" opens the same
// AdultReview route as Home; "New" opens the existing Create mission form.
function AdultTasksTab() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <AdultTasksScreen
      onReview={(taskId) => navigation.navigate('AdultReview', { kind: 'mission_review', id: taskId })}
      onNewMission={() => navigation.navigate('NewMission')}
    />
  );
}

// Slice 6C: Adult Rewards (Board 10). Requests' "Review" opens the same
// AdultReview route as Home (the existing reward review); "New reward"
// opens Create Reward.
function AdultRewardsTab() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <AdultRewardsScreen
      onReview={(redemptionId) => navigation.navigate('AdultReview', { kind: 'reward_request', id: redemptionId })}
      onNewReward={() => navigation.navigate('NewReward')}
    />
  );
}

function NewRewardRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'NewReward'>) {
  const onDone = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  return <NewRewardScreen onDone={onDone} />;
}

function AdultReviewRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'AdultReview'>) {
  const onDone = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  return <AdultReviewScreen kind={route.params.kind} id={route.params.id} onDone={onDone} />;
}

// Slice 6D: Adult Family (Board 12). Its Settings row opens the same
// root-stack Settings route as the Home avatar (one implementation).
function AdultFamilyTab() {
  const openSettings = useOpenSettings();
  return <AdultFamilyScreen onOpenSettings={openSettings} />;
}

function AdultTabs() {
  const screenOptions = useTabScreenOptions();
  return (
    <AdultTab.Navigator initialRouteName={DEFAULT_TAB} screenListeners={SCREEN_LISTENERS} screenOptions={screenOptions}>
      <AdultTab.Screen name="Home"    component={AdultHomeTab}      options={tabOptions('Home')} />
      <AdultTab.Screen name="Tasks"   component={AdultTasksTab}     options={tabOptions('Tasks')} />
      <AdultTab.Screen name="Rewards" component={AdultRewardsTab}   options={tabOptions('Rewards')} />
      <AdultTab.Screen name="Family"  component={AdultFamilyTab}    options={tabOptions('Family')} />
    </AdultTab.Navigator>
  );
}

function AdultSettingsScreen() {
  return <SettingsScreen audience={settingsAudienceForShell('adult')} inStack />;
}

// The shell is keyed by its kind. When hydration or a session refresh
// changes the role across the child/adult boundary, the whole shell
// remounts on DEFAULT_TAB (Home). It can never sit on a tab or a pushed
// Settings that doesn't exist for the resolved role. A change within the
// adult shell (for example admin → owner) keeps the current tab.
export function AppShell() {
  const role  = useAppStore(selectCurrentMemberRole);
  const shell: ShellKind = resolveShellKind(role);

  return (
    <Stack.Navigator key={shell} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={shell === 'adult' ? AdultTabs : ChildTabs} />
      {shell === 'adult' ? (
        <Stack.Screen
          name="AdultReview"
          component={AdultReviewRoute}
          options={{
            headerShown:      true,
            title:            copy.adultHome.reviewTitle,
            headerTintColor:  colors.primary,
            headerStyle:      { backgroundColor: colors.adultGround },
            headerTitleStyle: { color: colors.textPrimary },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerBackTitle:  'Back',
          }}
        />
      ) : null}
      {shell === 'adult' ? (
        <Stack.Screen
          name="NewMission"
          component={NewMissionScreen}
          options={{
            headerShown:      true,
            title:            copy.adultTasks.newMissionTitle,
            headerTintColor:  colors.primary,
            headerStyle:      { backgroundColor: colors.adultGround },
            headerTitleStyle: { color: colors.textPrimary },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerBackTitle:  'Back',
          }}
        />
      ) : null}
      {shell === 'adult' ? (
        <Stack.Screen
          name="NewReward"
          component={NewRewardRoute}
          options={{
            headerShown:      true,
            title:            copy.adultRewards.create.title,
            headerTintColor:  colors.primary,
            headerStyle:      { backgroundColor: colors.adultGround },
            headerTitleStyle: { color: colors.textPrimary },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerBackTitle:  'Back',
          }}
        />
      ) : null}
      {shell === 'adult' ? (
        <Stack.Screen
          name="Settings"
          component={AdultSettingsScreen}
          options={{
            headerShown:      true,
            title:            copy.screens.settings.title,
            headerTintColor:  colors.primary,
            headerStyle:      { backgroundColor: colors.background },
            headerTitleStyle: { color: colors.textPrimary },
            headerShadowVisible: false,
            // Arrow only, and never the internal route name "Tabs". 'Back'
            // makes the accessibility label "Go back".
            headerBackButtonDisplayMode: 'minimal',
            headerBackTitle:  'Back',
          }}
        />
      ) : (
        <Stack.Screen name="MissionDetails" component={MissionDetailsRoute} />
      )}
    </Stack.Navigator>
  );
}

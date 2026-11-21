// Slice 4: role-based navigation shell. Pure and Node-test safe: no React
// and no react-native.
//
// Navigation visibility is NOT authorization. Every action inside a screen
// stays gated by the permission selectors (src/store/selectors.ts), and the
// backend RLS/RPC guards stay authoritative. This module only decides which
// tabs exist.
//
// The shell is derived from the household permission set, never from a raw
// role comparison:
//   - A role that can create tasks gets the adult shell (adult, admin, owner).
//   - Everything else gets the child shell, including:
//       - child;
//       - a role that is null because it isn't hydrated yet;
//       - an unknown role.
//     That is the least-privileged shell. Every screen in it still checks
//     its own permissions, and Me always reaches Sign out, so nobody is
//     stranded.

import { hasHouseholdPermission } from '@/domain/permissions';

export type ShellKind = 'child' | 'adult';

export const CHILD_TABS = ['Home', 'Missions', 'Rewards', 'Me'] as const;
export const ADULT_TABS = ['Home', 'Tasks', 'Rewards', 'Family'] as const;

export type ChildTabRoute = (typeof CHILD_TABS)[number];
export type AdultTabRoute = (typeof ADULT_TABS)[number];
export type TabRoute = ChildTabRoute | AdultTabRoute;

// Routes pushed above the tab bar (root stack), per shell. The child
// shell's settings live in its Me tab; its one pushed route is Mission
// Details (Slice 5C), opened from Missions. The adult shell adds
// AdultReview (Slice 6A), opened from a Home or Tasks "Review", and
// NewMission (Slice 6B), the existing Create mission form, and NewReward
// (Slice 6C), Create Reward.
export const STACK_ROUTES: Record<ShellKind, readonly string[]> = {
  child: ['MissionDetails'],
  adult: ['Settings', 'AdultReview', 'NewMission', 'NewReward'],
};

// Locked target labels. The route name equals the label.
export const TAB_LABELS: Record<TabRoute, string> = {
  Home:     'Home',
  Missions: 'Missions',
  Tasks:    'Tasks',
  Rewards:  'Rewards',
  Me:       'Me',
  Family:   'Family',
};

// Every shell falls back to Home.
export const DEFAULT_TAB = 'Home' as const satisfies ChildTabRoute & AdultTabRoute;

// The routes that used to exist, and where each one now lives.
export const LEGACY_ROUTE_MAP: Record<'Today' | 'MyTasks' | 'Assigned' | 'Rewards' | 'Settings', Record<ShellKind, string>> = {
  Today:    { child: 'Home',     adult: 'Home' },
  MyTasks:  { child: 'Missions', adult: 'Tasks' },    // adult: Tasks → "My Tasks" view
  Assigned: { child: 'Home',     adult: 'Tasks' },    // child: never had anything to show here (no tasks.create)
  Rewards:  { child: 'Rewards',  adult: 'Rewards' },
  Settings: { child: 'Me',       adult: 'Settings' }, // adult: Home avatar, or Family → Settings
};

export function resolveShellKind(role: string | null | undefined): ShellKind {
  return hasHouseholdPermission(role, 'tasks.create') ? 'adult' : 'child';
}

export function tabsForShell(shell: ShellKind): readonly TabRoute[] {
  return shell === 'adult' ? ADULT_TABS : CHILD_TABS;
}

export function isRouteAvailable(shell: ShellKind, route: string): boolean {
  return (tabsForShell(shell) as readonly string[]).includes(route) || STACK_ROUTES[shell].includes(route);
}

// The tab to show after the role or shell changes. Keep the current tab if
// it still exists in the resolved shell, otherwise fall back to Home. The
// navigator is also keyed by shell (see AppTabs), so a shell change always
// remounts on DEFAULT_TAB and can never sit on a tab that no longer exists.
export function resolveTabAfterRoleChange(shell: ShellKind, currentRoute: string | null | undefined): TabRoute {
  if (currentRoute && (tabsForShell(shell) as readonly string[]).includes(currentRoute)) return currentRoute as TabRoute;
  return DEFAULT_TAB;
}

// Where Settings can be reached in each shell.
export type SettingsEntryPoint = 'meTab' | 'homeAvatar' | 'familySettingsLink';
export function settingsEntryPoints(shell: ShellKind): readonly SettingsEntryPoint[] {
  return shell === 'adult' ? ['homeAvatar', 'familySettingsLink'] : ['meTab'];
}

// The Settings audience. The child shell's Me tab never shows invites, even
// if a permission bug ever granted one: belt and braces on top of
// household.invite. The 'household' audience covers adult Settings, which
// is unchanged.
export type SettingsAudience = 'household' | 'child';
export function settingsAudienceForShell(shell: ShellKind): SettingsAudience {
  return shell === 'adult' ? 'household' : 'child';
}

// Adult Tasks puts the old Assigned and My Tasks screens behind one
// in-screen switch. Both keep their current UI. 'assigned' is the default
// because it holds Create mission and the follow-up list.
export const ADULT_TASK_VIEWS = ['assigned', 'mine'] as const;
export type AdultTaskView = (typeof ADULT_TASK_VIEWS)[number];
export const DEFAULT_ADULT_TASK_VIEW: AdultTaskView = 'assigned';

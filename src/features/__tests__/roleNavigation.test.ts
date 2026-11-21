// Slice 4: role-based navigation shell. These tests cover route
// availability, the role × capability matrix, role transitions and QA
// diagnostics gating. There is no RN renderer in this repo, so wiring is
// proven from the shell's source (comments stripped) plus the pure rules in
// roleShell.ts and settingsLayout.ts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { hasHouseholdPermission, type HouseholdPermission } from '@/domain/permissions';
import { isSyncDiagnosticsVisible } from '@/features/sync/syncDiagnostics';
import {
  ADULT_TABS,
  ADULT_TASK_VIEWS,
  CHILD_TABS,
  DEFAULT_ADULT_TASK_VIEW,
  DEFAULT_TAB,
  LEGACY_ROUTE_MAP,
  TAB_LABELS,
  isRouteAvailable,
  resolveShellKind,
  resolveTabAfterRoleChange,
  settingsAudienceForShell,
  settingsEntryPoints,
  tabsForShell,
  type ShellKind,
} from '@/navigation/roleShell';
import { visibleFamilySections, visibleSettingsSections } from '@/screens/settingsLayout';

const SRC  = new URL('../../', import.meta.url);
const ROOT = new URL('../../../', import.meta.url);
const strip = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
const code = (rel: string) => strip(readFileSync(new URL(rel, SRC), 'utf8'));

const ROLES = ['child', 'adult', 'admin', 'owner'] as const;
type Role = (typeof ROLES)[number];
const SHELL: Record<Role, ShellKind> = { child: 'child', adult: 'adult', admin: 'adult', owner: 'adult' };

// ── Visible / hidden tabs + default tab ─────────────────────────────────────

test('visible tabs per role are exactly the locked targets, in order', () => {
  for (const role of ROLES) {
    const shell = resolveShellKind(role);
    assert.equal(shell, SHELL[role], role);
    assert.deepEqual([...tabsForShell(shell)], shell === 'child' ? ['Home', 'Missions', 'Rewards', 'Me'] : ['Home', 'Tasks', 'Rewards', 'Family'], role);
    for (const t of tabsForShell(shell)) assert.equal(TAB_LABELS[t], t, 'label = route, no temporary names');
  }
});

test('hidden tabs: no legacy tab survives, and each shell hides the other shell’s tabs', () => {
  for (const role of ROLES) {
    const shell = resolveShellKind(role);
    for (const legacy of ['Today', 'MyTasks', 'Assigned']) assert.equal(isRouteAvailable(shell, legacy), false, `${role} ${legacy}`);
    // Settings is never a tab. It is a pushed route in the adult shell only.
    assert.ok(!(tabsForShell(shell) as readonly string[]).includes('Settings'), role);
    assert.equal(isRouteAvailable(shell, 'Settings'), shell === 'adult', role);
  }
  for (const t of ['Tasks', 'Family']) assert.equal(isRouteAvailable('child', t), false, t);
  for (const t of ['Missions', 'Me'])  assert.equal(isRouteAvailable('adult', t), false, t);
});

test('default tab is Home for every role (and Home exists in both shells)', () => {
  assert.equal(DEFAULT_TAB, 'Home');
  assert.ok((CHILD_TABS as readonly string[]).includes(DEFAULT_TAB));
  assert.ok((ADULT_TABS as readonly string[]).includes(DEFAULT_TAB));
  const shell = code('navigation/AppTabs.tsx');
  assert.equal((shell.match(/initialRouteName=\{DEFAULT_TAB\}/g) ?? []).length, 2);
});

// ── Route availability, as actually registered ──────────────────────────────

function registered(src: string, nav: string): string[] {
  return [...src.matchAll(new RegExp(`<${nav}\\.Screen\\s+name="(\\w+)"`, 'g'))].map((m) => m[1]);
}

test('the navigator registers exactly the target routes per shell, with the expected screens', () => {
  const src = code('navigation/AppTabs.tsx');
  assert.deepEqual(registered(src, 'ChildTab'), [...CHILD_TABS]);
  assert.deepEqual(registered(src, 'AdultTab'), [...ADULT_TABS]);
  // Slice 6A: AdultReview (adult only), opened from a Home "Review" row.
  // Slice 6B: NewMission (adult only), the existing Create mission form.
  // Slice 6C: NewReward (adult only), Create Reward.
  assert.deepEqual(registered(src, 'Stack'), ['Tabs', 'AdultReview', 'NewMission', 'NewReward', 'Settings', 'MissionDetails']);
  // Current screens moved into the target slots.
  // Slice 5A: the child Home is the new Child Home screen. The adult Home
  // stays on the current Today screen.
  assert.ok(src.includes('<ChildTab.Screen name="Home"     component={ChildHomeScreen}'));
  // Slice 5B: the child Missions tab is the new Child Missions screen. The
  // adult "My Tasks" view (Tasks tab) stays on MyTasksScreen.
  // Slice 5C: through a shell wrapper that passes onOpenMission.
  assert.ok(src.includes('<ChildTab.Screen name="Missions" component={ChildMissionsTab}'));
  // Slice 5D: the child Rewards tab is the new Child Rewards screen.
  // Slice 6C: the adult Rewards tab is the new Adult Rewards screen.
  assert.ok(src.includes('<ChildTab.Screen name="Rewards"  component={ChildRewardsScreen}'));
  assert.ok(src.includes('<ChildTab.Screen name="Me"       component={ChildMeScreen}'));
  // Slice 6A: the adult Home is the new Adult Home screen, and Tasks takes
  // the view Home's New mission asks for. Both through shell wrappers.
  assert.ok(src.includes('<AdultTab.Screen name="Home"    component={AdultHomeTab}'));
  assert.ok(src.includes('<AdultTab.Screen name="Tasks"   component={AdultTasksTab}'));
  // Slice 6B: Tasks is the new Adult Tasks screen (Board 07).
  assert.ok(/function AdultTasksTab\(\) \{[\s\S]*?<AdultTasksScreen\s+onReview=/.test(src));
  assert.ok(!src.includes('<TasksScreen'), 'the old Assigned / My Tasks switch is no longer mounted');
  assert.ok(src.includes('<AdultTab.Screen name="Rewards" component={AdultRewardsTab}'));
  assert.ok(/function AdultRewardsTab\(\) \{[\s\S]*?<AdultRewardsScreen\s+onReview=/.test(src));
  assert.ok(!src.includes('<RewardsScreen') && !src.includes("from '@/screens/RewardsScreen'"), 'the old adult Rewards screen is no longer mounted');
  // Slice 6D: Family is the new Adult Family screen (Board 12).
  assert.ok(src.includes('<AdultTab.Screen name="Family"  component={AdultFamilyTab}'));
  assert.ok(!src.includes('<FamilyScreen') && !src.includes("from '@/screens/FamilyScreen'"), 'the old Family screen is no longer mounted');
  assert.ok(/function ChildMeScreen\(\) \{\s*return <SettingsScreen audience=\{settingsAudienceForShell\('child'\)\} \/>;/.test(src));
  assert.ok(/function AdultHomeTab\(\) \{[\s\S]*?<AdultHomeScreen\s+onOpenSettings=\{openSettings\}/.test(src));
  assert.ok(!src.includes('TodayScreen'), 'the adult Home no longer renders the old Today screen');
  // AdultReview is registered only in the adult branch.
  assert.ok(/\{shell === 'adult' \? \(\s*<Stack\.Screen\s+name="AdultReview"/.test(src));
  // Settings is registered only in the adult branch.
  assert.ok(/\{shell === 'adult' \? \(\s*<Stack\.Screen\s+name="Settings"/.test(src));
  // Slice 5C: Mission Details is registered only in the child branch.
  assert.ok(/\) : \(\s*<Stack\.Screen name="MissionDetails" component=\{MissionDetailsRoute\} \/>\s*\)\}/.test(src));
  // Every route has an icon from the existing Ionicons family.
  for (const t of [...CHILD_TABS, ...ADULT_TABS]) assert.ok(new RegExp(`\\b${t}:\\s+\\{ active: '`).test(src), t);
  assert.ok(src.includes("from '@expo/vector-icons'"));
  // The root navigator mounts the role-aware shell.
  assert.ok(code('navigation/RootNavigator.tsx').includes('<AppShell />'));
});

test('every legacy route maps to a route that exists in each shell', () => {
  for (const [legacy, byShell] of Object.entries(LEGACY_ROUTE_MAP)) {
    for (const shell of ['child', 'adult'] as const) assert.ok(isRouteAvailable(shell, byShell[shell]), `${legacy} → ${shell}`);
  }
});

// Slice 6B: Board 07 replaces the Assigned / My Tasks switch with Open ·
// Waiting · Sent back · Done. What the two views offered stays reachable:
// the Create mission form (NewMission route) and the viewer's own task
// list with its direct Complete (Adult Tasks Open rows). The legacy view
// constants and TasksScreen remain, unmounted.
test('adult Tasks: Board 07 segments replace the legacy views; their functions stay reachable', () => {
  assert.deepEqual([...ADULT_TASK_VIEWS], ['assigned', 'mine']);
  assert.equal(DEFAULT_ADULT_TASK_VIEW, 'assigned');
  const shell = code('navigation/AppTabs.tsx');
  assert.ok(!/TasksScreen/.test(shell), 'TasksScreen (the old switch) is not mounted');
  assert.ok(isRouteAvailable('adult', 'NewMission'));
  assert.ok(code('screens/NewMissionScreen.tsx').includes('<CreateTaskForm'));
  const tasks = code('screens/AdultTasksScreen.tsx');
  assert.ok(tasks.includes('completeTask(') && tasks.includes('claimOpenTask('));
});

// ── Role × capability matrix (permission guard + route) ─────────────────────

type Cap = {
  name:       string;
  permission: HouseholdPermission | null;   // null = available to any signed-in member
  roles:      readonly Role[];              // who must be allowed
  route:      Record<ShellKind, string | null>;
  host:       string;                       // file that renders the capability
  evidence:   readonly string[];            // what proves it is wired there
};

const ALL: readonly Role[] = ROLES;
const ADULTS: readonly Role[] = ['adult', 'admin', 'owner'];

const MATRIX: readonly Cap[] = [
  // Slice 6B: the adult Tasks tab is AdultTasksScreen (Board 07).
  { name: 'view own tasks',          permission: 'tasks.complete',             roles: ADULTS, route: { child: null, adult: 'Tasks' },         host: 'screens/AdultTasksScreen.tsx',    evidence: ['buildAdultTasksModel('] },
  // Slice 5B: the child's Missions tab is ChildMissionsScreen (To Do /
  // Waiting / Done), built on the same flows.
  { name: 'view own tasks (child Missions)', permission: 'tasks.complete',  roles: ['child'], route: { child: 'Missions', adult: null }, host: 'screens/ChildMissionsScreen.tsx', evidence: ['buildChildMissionsModel('] },
  { name: 'open-to-anyone claim (child Missions)', permission: 'tasks.claim_open', roles: ['child'], route: { child: 'Missions', adult: null }, host: 'screens/ChildMissionsScreen.tsx', evidence: ["mission.action === 'claim'", 'claimOpenTask('] },
  // Slice 6B: the adult claim lives on Adult Tasks Open rows (the old
  // adult Home that hosted it was replaced in Slice 6A).
  { name: 'open-to-anyone claim',    permission: 'tasks.claim_open',           roles: ADULTS, route: { child: null, adult: 'Tasks' },         host: 'screens/AdultTasksScreen.tsx',    evidence: ["row.action === 'claim'", 'claimOpenTask('] },
  // Slice 5A: the child's Home is ChildHomeScreen, which keeps the old Home
  // actions (claim, complete / retry, Change photos / Cancel).
  { name: 'open-to-anyone claim (child Home)', permission: 'tasks.claim_open', roles: ['child'], route: { child: 'Home', adult: null }, host: 'screens/ChildHomeScreen.tsx', evidence: ["mission.action === 'claim'", 'claimOpenTask('] },
  { name: 'complete / retry / manage (child Home)', permission: 'tasks.complete', roles: ['child'], route: { child: 'Home', adult: null }, host: 'screens/ChildHomeScreen.tsx', evidence: ['<TaskCompletionModal', '<PendingCompletionModal'] },
  // Slice 6B: an adult completes their own task directly (completeTask);
  // the evidence modal is the child's path.
  { name: 'complete own task (adult)', permission: 'tasks.complete',          roles: ADULTS, route: { child: null, adult: 'Tasks' },         host: 'screens/AdultTasksScreen.tsx',    evidence: ["row.action === 'complete'", 'completeTask('] },
  { name: 'submit completion + evidence (child Missions)', permission: 'tasks.complete', roles: ['child'], route: { child: 'Missions', adult: null }, host: 'screens/ChildMissionsScreen.tsx', evidence: ['<TaskCompletionModal'] },
  { name: 'pending / Change photos / Cancel completion', permission: 'tasks.complete', roles: ['child'], route: { child: 'Missions', adult: null }, host: 'screens/ChildMissionsScreen.tsx', evidence: ['<PendingCompletionModal'] },
  { name: 'sent-back retry',         permission: 'tasks.complete',             roles: ['child'], route: { child: 'Missions', adult: null },   host: 'screens/ChildMissionsScreen.tsx', evidence: ["mission.action === 'retry'", '<TaskCompletionModal'] },
  { name: 'reward request',          permission: 'rewards.request_redemption', roles: ALL,    route: { child: 'Rewards', adult: null },       host: 'screens/ChildRewardsScreen.tsx',  evidence: ['useRewardRequestFlow(', '<ConfirmRewardRequestModal'] },
  { name: 'reward cancellation',     permission: 'rewards.cancel_redemption',  roles: ALL,    route: { child: 'Rewards', adult: null },       host: 'screens/ChildRewardsScreen.tsx',  evidence: ['flow.openCancel', '<CancelRewardRequestModal'] },
  { name: 'contribution claim',      permission: 'contributions.claim_completed', roles: ALL, route: { child: 'Home', adult: null },          host: 'screens/ChildHomeScreen.tsx',     evidence: ['<ClaimContributionForm'] },
  // Slice 6B: the existing form, hosted by the NewMission route.
  { name: 'create task',             permission: 'tasks.create',               roles: ADULTS, route: { child: null, adult: 'NewMission' },    host: 'screens/NewMissionScreen.tsx',    evidence: ['{canCreateTasks && household && user && (', '<CreateTaskForm'] },
  { name: 'review completion (approve / send back)', permission: 'tasks.approve_completion', roles: ADULTS, route: { child: null, adult: 'Home' }, host: 'screens/TodayScreen.tsx', evidence: ['<TaskReviewSection', '<TaskReviewEvidenceModal'] },
  { name: 'reward review',           permission: 'rewards.approve_redemption', roles: ADULTS, route: { child: null, adult: 'Home' },          host: 'screens/TodayScreen.tsx',         evidence: ['<RedemptionReviewSection'] },
  // Slice 6C: Adult Rewards lists the requests; Review opens the same
  // AdultReview route, which hosts RedemptionReviewSection.
  { name: 'reward review (Rewards)', permission: 'rewards.approve_redemption', roles: ADULTS, route: { child: null, adult: 'AdultReview' },   host: 'screens/AdultReviewScreen.tsx',   evidence: ['<RedemptionReviewSection'] },
  // Slice 6C: Create Reward, hosted by the NewReward route.
  { name: 'create reward',           permission: 'rewards.create',             roles: ADULTS, route: { child: null, adult: 'NewReward' },     host: 'screens/NewRewardScreen.tsx',     evidence: ['useAppStore(selectCanCreateRewards)', 'createReward({'] },
  { name: 'helpful contribution review', permission: 'contributions.approve_claim', roles: ADULTS, route: { child: null, adult: 'Home' },     host: 'screens/TodayScreen.tsx',         evidence: ['<ContributionReviewSection'] },
  // Slice 6D: Adult Family shows members and the current invite code;
  // generate / revoke stay in Settings → Invites (HouseholdInvitesSection).
  { name: 'members',                 permission: null,                         roles: ADULTS, route: { child: null, adult: 'Family' },        host: 'screens/AdultFamilyScreen.tsx',   evidence: ['model.members.rows.map('] },
  { name: 'invites',                 permission: 'household.invite',           roles: ['admin', 'owner'], route: { child: null, adult: 'Family' }, host: 'screens/AdultFamilyScreen.tsx', evidence: ['<InviteSection card={model.invite} />'] },
  { name: 'invite management (generate / revoke)', permission: 'household.invite', roles: ['admin', 'owner'], route: { child: null, adult: 'Settings' }, host: 'screens/SettingsScreen.tsx', evidence: ["case 'invites':", '<HouseholdInvitesSection'] },
  { name: 'edit profile',            permission: null,                         roles: ALL,    route: { child: 'Me', adult: 'Family' },        host: 'screens/SettingsScreen.tsx',      evidence: ['<ProfileEditModal', 'copy.settingsScreen.editProfile'] },
  { name: 'Settings',                permission: null,                         roles: ALL,    route: { child: 'Me', adult: 'Settings' },      host: 'screens/SettingsScreen.tsx',      evidence: ['<SettingsSectionList sections={sections} />'] },
  { name: 'sign out',                permission: null,                         roles: ALL,    route: { child: 'Me', adult: 'Settings' },      host: 'screens/SettingsScreen.tsx',      evidence: ['onPress={confirmSignOut}'] },
];

test('role × capability matrix: permission per role is unchanged and the hosting route exists in that role’s shell', () => {
  const rows: string[] = [];
  for (const cap of MATRIX) {
    for (const role of ROLES) {
      const allowedByPermission = cap.permission === null || hasHouseholdPermission(role, cap.permission);
      const expected = cap.roles.includes(role);
      // The permission layer still decides. Navigation never widens it.
      if (expected) assert.ok(allowedByPermission, `${cap.name} must be permitted for ${role}`);
      const route = cap.route[SHELL[role]];
      if (expected && route !== null) {
        assert.ok(isRouteAvailable(SHELL[role], route), `${cap.name}: ${role} → ${route}`);
        rows.push(`${cap.name} | ${role} | ${route}`);
      }
    }
    const src = code(cap.host);
    for (const e of cap.evidence) assert.ok(src.includes(e), `${cap.name}: ${cap.host} lacks ${e}`);
  }
  // Every capability is reachable for every role that holds it, apart from
  // the deliberately child-only flows: an adult never requests or cancels a
  // reward, or files a claim.
  for (const cap of MATRIX) for (const role of cap.roles) {
    const route = cap.route[SHELL[role]];
    const childOnlyFlow = ['reward request', 'reward cancellation', 'contribution claim'].includes(cap.name);
    if (!(childOnlyFlow && SHELL[role] === 'adult')) assert.ok(route !== null, `${cap.name} has no route for ${role}`);
  }
  assert.ok(rows.length > 40);
});

test('permission guard: review / create / invite remain denied to a child whatever the navigation shows', () => {
  for (const p of ['tasks.create', 'tasks.approve_completion', 'tasks.reject_completion', 'rewards.create', 'rewards.approve_redemption', 'contributions.approve_claim', 'household.invite'] as const) {
    assert.equal(hasHouseholdPermission('child', p), false, p);
  }
  assert.equal(hasHouseholdPermission('adult', 'household.invite'), false, 'adult cannot invite');
  // The screens still gate on the permission selectors, not on the tab.
  assert.ok(code('screens/AssignedByMeScreen.tsx').includes('useAppStore(selectCanCreateTasks)'));
  assert.ok(code('screens/NewMissionScreen.tsx').includes('useAppStore(selectCanCreateTasks)'));
  assert.ok(code('screens/AdultTasksScreen.tsx').includes('useAppStore(selectCanCreateTasks)'));
  assert.ok(code('screens/RewardsScreen.tsx').includes('useAppStore(selectCanCreateRewards)'));
  assert.ok(code('screens/NewRewardScreen.tsx').includes('useAppStore(selectCanCreateRewards)'));
  assert.ok(code('screens/AdultRewardsScreen.tsx').includes('useAppStore(selectCanCreateRewards)'));
  assert.ok(code('screens/AdultRewardsScreen.tsx').includes('useAppStore(selectCanApproveRedemption)'));
  assert.ok(code('screens/FamilyScreen.tsx').includes('useAppStore(selectCanInviteMembers)'));
  assert.ok(code('screens/AdultFamilyScreen.tsx').includes('useAppStore(selectCanInviteMembers)'));
  assert.ok(code('screens/SettingsScreen.tsx').includes('useAppStore(selectCanInviteMembers)'));
});

// ── Settings reachability ───────────────────────────────────────────────────

test('Settings: child via Me (no invites ever); adult via Home avatar and Family → Settings; one implementation', () => {
  assert.deepEqual([...settingsEntryPoints('child')], ['meTab']);
  assert.deepEqual([...settingsEntryPoints('adult')], ['homeAvatar', 'familySettingsLink']);
  assert.equal(settingsAudienceForShell('child'), 'child');
  assert.equal(settingsAudienceForShell('adult'), 'household');

  // Even if canInviteMembers were true, the child audience never shows invites.
  const me = visibleSettingsSections({ isAuthenticated: true, hasActiveHousehold: true, canInviteMembers: true, audience: 'child' });
  assert.deepEqual(me, ['profile', 'household', 'about', 'session']);
  const adult = visibleSettingsSections({ isAuthenticated: true, hasActiveHousehold: true, canInviteMembers: true });
  assert.deepEqual(adult, ['profile', 'household', 'invites', 'about', 'session'], 'adult Settings unchanged');

  const fam = visibleFamilySections({ isAuthenticated: true, hasActiveHousehold: true, canInviteMembers: true });
  assert.deepEqual(fam, ['profile', 'household', 'members', 'invites', 'settingsLink']);
  assert.ok(!visibleFamilySections({ isAuthenticated: true, hasActiveHousehold: true, canInviteMembers: false }).includes('invites'));

  const shell = code('navigation/AppTabs.tsx');
  assert.ok(shell.includes("navigation.navigate('Settings')"));
  // Slice 6A: the avatar lives in the Adult Home header; the shell passes
  // the same Settings navigation in.
  const home = code('screens/AdultHomeScreen.tsx');
  assert.ok(/<Pressable\s+onPress=\{onOpenSettings\}[\s\S]*?accessibilityLabel=\{copy\.navigation\.openProfileA11y\}/.test(home));
  assert.ok(shell.includes('onOpenSettings={openSettings}'));
  assert.ok(/function AdultFamilyTab\(\) \{\s*const openSettings = useOpenSettings\(\);\s*return <AdultFamilyScreen onOpenSettings=\{openSettings\} \/>;/.test(shell));
  assert.ok(shell.includes('<SettingsScreen audience={settingsAudienceForShell(\'adult\')} inStack />'));
  // Slice 6D: Adult Family reuses the existing ProfileEditModal and opens
  // the one Settings; it never signs out or manages invites itself.
  const family = code('screens/AdultFamilyScreen.tsx');
  assert.ok(family.includes('<ProfileEditModal visible={profileOpen}'));
  assert.ok(family.includes('onPress={onOpenSettings}'));
  assert.ok(!/signOut|HouseholdInvitesSection|createInvite|revokeInvite/.test(family));
});

// ── QA diagnostics gating ───────────────────────────────────────────────────

test('QA diagnostics: shown in QA builds only, for both shells (child Me, adult Settings)', () => {
  for (const audience of ['child', 'household'] as const) {
    for (const variant of ['qa', 'production', 'development', null]) {
      const s = visibleSettingsSections({ isAuthenticated: true, hasActiveHousehold: true, canInviteMembers: false, audience, showSyncDiagnostics: isSyncDiagnosticsVisible(variant) });
      assert.equal(s.includes('syncDiagnostics'), variant === 'qa', `${audience} ${variant}`);
      assert.equal(s.at(-1), 'session');
    }
  }
  assert.ok(code('screens/SettingsScreen.tsx').includes('showSyncDiagnostics: isSyncDiagnosticsVisible(currentBuildInfo.appVariant),'));
});

// ── Role change after hydration / session refresh / re-login ────────────────

test('unknown role during startup → least-privileged child shell on Home; never stuck', () => {
  for (const r of [null, undefined, '', 'member', 'superuser']) {
    assert.equal(resolveShellKind(r), 'child', String(r));
  }
  assert.equal(resolveTabAfterRoleChange('child', null), 'Home');
});

test('role resolves or changes after hydration → lands on a tab that exists', () => {
  // A null role becomes adult: the shell flips, so Home.
  assert.equal(resolveTabAfterRoleChange(resolveShellKind('owner'), 'Me'), 'Home');
  // An adult on Family becomes a child: Family doesn't exist there, so Home.
  assert.equal(resolveTabAfterRoleChange(resolveShellKind('child'), 'Family'), 'Home');
  assert.equal(resolveTabAfterRoleChange(resolveShellKind('child'), 'Tasks'), 'Home');
  assert.equal(resolveTabAfterRoleChange(resolveShellKind('child'), 'Settings'), 'Home');
  // A child on Missions becomes an adult: Home.
  assert.equal(resolveTabAfterRoleChange(resolveShellKind('adult'), 'Missions'), 'Home');
  // admin → owner stays in the same shell, so the current tab is kept.
  assert.equal(resolveTabAfterRoleChange(resolveShellKind('owner'), 'Family'), 'Family');
  assert.equal(resolveTabAfterRoleChange(resolveShellKind('admin'), 'Rewards'), 'Rewards');
  // Every tab of each shell is kept when the shell doesn't change.
  for (const shell of ['child', 'adult'] as const) for (const t of tabsForShell(shell)) assert.equal(resolveTabAfterRoleChange(shell, t), t);
});

test('the shell is keyed by kind and reads the live role, so a transition remounts on Home', () => {
  const src = code('navigation/AppTabs.tsx');
  assert.ok(src.includes('const role  = useAppStore(selectCurrentMemberRole);'));
  assert.ok(src.includes('const shell: ShellKind = resolveShellKind(role);'));
  assert.ok(src.includes('<Stack.Navigator key={shell}'));
  assert.ok(/component=\{shell === 'adult' \? AdultTabs : ChildTabs\}/.test(src));
});

test('logout / login as a different role starts a fresh navigation tree', () => {
  // AuthGate swaps RootNavigator (its own NavigationContainer) for AuthStack
  // on sign-out, so a new login mounts a new container on the new role's
  // Home.
  const gate = code('navigation/AuthenticatedAppGate.tsx');
  assert.ok(gate.includes('return <RootNavigator />;'));
  const root = code('navigation/RootNavigator.tsx');
  assert.ok(root.includes('<NavigationContainer>'));
  // The owner signs out and a child signs in: child shell, Home.
  assert.equal(resolveTabAfterRoleChange(resolveShellKind('child'), undefined), 'Home');
  // E2E logout no longer looks for a Settings tab.
  const e2e = strip(readFileSync(new URL('e2e/helpers.ts', ROOT), 'utf8'));
  assert.ok(!e2e.includes("getByText('Settings', { exact: true }).click()"));
  assert.ok(e2e.includes("page.getByText('Me', { exact: true })"));
  assert.ok(e2e.includes("page.getByText('Family', { exact: true })"));
});

// ── Screens stay navigation-free; no visual facelift ────────────────────────

test('screens never navigate: the shell passes callbacks and slots in', () => {
  for (const f of ['screens/TodayScreen.tsx', 'screens/ChildHomeScreen.tsx', 'screens/ChildMissionsScreen.tsx', 'screens/MyTasksScreen.tsx', 'screens/AssignedByMeScreen.tsx', 'screens/FamilyScreen.tsx', 'screens/AdultFamilyScreen.tsx', 'screens/TasksScreen.tsx', 'screens/SettingsScreen.tsx', 'screens/RewardsScreen.tsx']) {
    assert.ok(!/useNavigation|navigation\.navigate|navigate\(/.test(code(f)), f);
  }
});

test('no facelift: no Rubik / locked type layer / density variants in the shell or the new screens', () => {
  for (const f of ['navigation/AppTabs.tsx', 'screens/FamilyScreen.tsx', 'screens/TasksScreen.tsx']) {
    assert.ok(!/Rubik|lockedTextStyle|useRubikReady|density=|variant="gold"/.test(code(f)), f);
  }
});

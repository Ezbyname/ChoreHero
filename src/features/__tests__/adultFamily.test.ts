// Slice 6D: Adult Family (Board 12). Profile row (real name / role /
// household, existing ProfileEditModal), Members (count = rows, store
// order, identity + role only), Invite someone (owner/admin only, newest
// usable code by the A4 redemption rule, truthful validity from
// expires_at, Share → system sheet with clipboard fallback, no invite
// management here), Settings (same route as the Home avatar, not a tab),
// privacy and banned features, and the function-preservation map.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildAdultFamilyModel,
  buildInviteCard,
  daysLeft,
  isUsableInvite,
  validityLabel,
  type AdultFamilyInput,
} from '@/features/adultFamily/adultFamilyModel';
import { hasHouseholdPermission } from '@/domain/permissions';
import { ADULT_TABS, CHILD_TABS, STACK_ROUTES, settingsEntryPoints } from '@/navigation/roleShell';
import { visibleSettingsSections } from '@/screens/settingsLayout';
import type { HouseholdMember } from '@/types';
import type { HouseholdInviteRow } from '@/types/supabase';

const SRC = new URL('../../', import.meta.url);
const raw  = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8');
const code = (rel: string) => raw(rel).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const SCREEN = 'screens/AdultFamilyScreen.tsx';
const MODEL  = 'features/adultFamily/adultFamilyModel.ts';
const HOOK   = 'features/adultFamily/useActiveInvites.ts';
const SHELL  = 'navigation/AppTabs.tsx';
const COPY   = raw('content/copy.ts');
const FAM_COPY = COPY.slice(COPY.indexOf('  adultFamily: {'), COPY.indexOf('  // Slice 6C: Adult Rewards'));

const NOW = new Date('2026-11-19T10:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
const MEMBERS: HouseholdMember[] = [
  { id: 'm1', userId: 'dana', name: 'Dana', role: 'owner' },
  { id: 'm2', userId: 'maya', name: 'Maya', role: 'child' },
  { id: 'm3', userId: 'avi', name: 'Avi', role: 'adult', avatarEmoji: '🦊' },
  { id: 'm4', userId: 'noam', name: 'Noam', role: 'child' },
  { id: 'm5', userId: 'ruth', name: 'Ruth', role: 'admin' },
];
const invite = (id: string, over: Partial<HouseholdInviteRow> = {}): HouseholdInviteRow => ({
  id, household_id: 'h1', code: `CODE-${id}`, role: 'child', created_by_profile_id: 'dana', redemption_count: 0,
  revoked_at: null, expires_at: at(30), created_at: at(-1), ...over,
});
const input = (over: Partial<AdultFamilyInput> = {}): AdultFamilyInput => ({
  viewer: { id: 'dana', name: 'Dana' },
  role: 'owner',
  householdName: 'The Cohen family',
  members: MEMBERS,
  canInvite: true,
  invites: { kind: 'ready', invites: [invite('a', { code: 'K7QX92MD', expires_at: at(23), created_at: at(-7) })] },
  now: NOW,
  ...over,
});

// ── Profile ────────────────────────────────────────────────────────────────

test('profile: the real viewer, role and household name', () => {
  const p = buildAdultFamilyModel(input()).profile!;
  assert.equal(p.name, 'Dana');
  assert.equal(p.roleLabel, 'Owner');
  assert.equal(p.line, 'Owner · The Cohen family');
  assert.equal(p.a11yLabel, 'Dana. Owner · The Cohen family');
  assert.equal(buildAdultFamilyModel(input({ role: 'adult', householdName: null })).profile!.line, 'Adult');
  assert.equal(buildAdultFamilyModel(input({ role: 'admin', householdName: 'Rosenblum-Cohen household of Haifa' })).profile!.line, 'Admin · Rosenblum-Cohen household of Haifa');
  // Name falls back to the viewer's own member row, never a placeholder person.
  assert.equal(buildAdultFamilyModel(input({ viewer: { id: 'avi', name: null } })).profile!.name, 'Avi');
  assert.equal(buildAdultFamilyModel(input({ viewer: null })).profile, null);
});

test('profile: "Profile" opens the EXISTING ProfileEditModal; no new profile fields', () => {
  const s = code(SCREEN);
  assert.ok(s.includes("import { ProfileEditModal } from '@/features/profile/ProfileEditModal';"));
  assert.ok(/onPress=\{\(\) => setProfileOpen\(true\)\}[\s\S]{0,200}accessibilityLabel=\{copy\.adultFamily\.profileA11y\}/.test(s));
  assert.ok(s.includes('<ProfileEditModal visible={profileOpen} onClose={() => setProfileOpen(false)} />'));
  assert.ok(!/\b(bio|age|gender|birthday|achievement|stats)\b/i.test(s + code(MODEL)));
});

// ── Members ────────────────────────────────────────────────────────────────

test('members: count = rows, current household only, store order kept', () => {
  const m = buildAdultFamilyModel(input()).members;
  assert.equal(m.count, 5);
  assert.equal(m.rows.length, m.count);
  assert.equal(m.heading, 'Members · 5');
  assert.deepEqual(m.rows.map((r) => r.name), ['Dana', 'Maya', 'Avi', 'Noam', 'Ruth'], 'not alphabetical, not by role');
  const many = Array.from({ length: 14 }, (_, i): HouseholdMember => ({ id: `x${i}`, userId: `u${i}`, name: `Member ${i}`, role: i % 3 ? 'child' : 'adult' }));
  const big = buildAdultFamilyModel(input({ members: many })).members;
  assert.equal(big.count, 14, 'never capped at four');
  assert.equal(big.heading, 'Members · 14');
  assert.equal(buildAdultFamilyModel(input({ members: [] })).members.heading, 'Members · 0');
  // Store order comes from the repository: joined_at ASC, id ASC.
  assert.ok(/from\('household_members'\)[\s\S]{0,80}\.order\('joined_at', \{ ascending: true \}\)\s*\.order\('id',\s+\{ ascending: true \}\)/.test(raw('lib/repositories/households.ts')));
});

test('members: identity + role only, roles in the current vocabulary, readable as text', () => {
  const rows = buildAdultFamilyModel(input()).members.rows;
  assert.deepEqual(rows.map((r) => r.roleLabel), ['Owner', 'Child', 'Adult', 'Child', 'Admin']);
  assert.equal(rows[0].a11yLabel, 'Dana, Owner');
  assert.deepEqual(Object.keys(rows[0]).sort(), ['a11yLabel', 'member', 'name', 'roleLabel']);
  // No adults-only household problem: no children is fine.
  const adults = buildAdultFamilyModel(input({ members: MEMBERS.filter((m) => m.role !== 'child') })).members;
  assert.equal(adults.count, 3);
});

// ── Privacy / banned features ──────────────────────────────────────────────

test('privacy: no Points, balances, progress, task stats, rewards earned or rankings', () => {
  for (const f of [SCREEN, MODEL, HOOK]) {
    const s = code(f);
    assert.ok(!/pointsBalances|selectPointsBalances|selectMyPointsBalance|balance|held|selectTasks|selectDailyProgress|dailyProgress|selectRewardRedemptions|RewardRedemption|rank|leaderboard|percent|progress/i.test(s), `${f}: no analytics`);
  }
  const json = JSON.stringify(buildAdultFamilyModel(input()));
  assert.ok(!/points|balance|progress|rank|completed|score/i.test(json));
});

test('banned: no family progress metric, leaderboard, challenge, goal, feed, XP or member actions', () => {
  for (const f of [SCREEN, MODEL]) {
    const s = code(f);
    assert.ok(!/Our family today|familyToday|Family progress|family score|leaderboard|challenge|goal|announcement|calendar|activity|streak|badge/i.test(s) && !/XP/.test(s), f);
    assert.ok(!/\b(remove|promote|demote|transfer|ban|kick|changeRole|Regenerate|Revoke|revokeInvite|createInvite|Delete)\b/.test(s), `${f}: no member or invite management controls`);
  }
  assert.ok(!/Family progress|Our family today|leaderboard|Regenerate|Revoke|Remove member/i.test(FAM_COPY));
});

test('adult tokens: flat hairline cards, adult ground, Rubik layer, 48dp, no gold, no child styling', () => {
  const s = code(SCREEN);
  assert.ok((s.match(/<Card density="adult"/g) ?? []).length >= 4);
  assert.ok(/backgroundColor:\s+colors\.adultGround/.test(s));
  assert.ok(s.includes('useAdultText') && !/fontSize:|fontWeight:/.test(s));
  assert.ok(!/colors\.gold|variant="gold"|goldDeep|density="child"|depth\.|shadows\.|elevation|shadowOffset|Illustration|MissionArt/.test(s));
  assert.ok(/shareButton: \{[\s\S]*?minHeight:\s+sizes\.adultButton,[\s\S]*?borderRadius:\s+radius\.control,/.test(s));
  assert.ok(/textButton: \{[\s\S]*?minHeight:\s+sizes\.tapTarget,[\s\S]*?minWidth:\s+sizes\.tapTarget,/.test(s));
  assert.ok(/settingsRow: \{[\s\S]*?minHeight:\s+56,/.test(s) && /memberRow: \{[\s\S]*?minHeight:\s+56,/.test(s));
  // Role pills: indigo tint + text, never gold, never colour-only.
  assert.ok(/rolePill: \{[\s\S]*?backgroundColor:\s+colors\.indigoTint,/.test(s));
  assert.ok(/<View style=\{styles\.rolePill\}>\s*<Text[^>]*>\{row\.roleLabel\}<\/Text>/.test(s));
  assert.ok(!/numberOfLines/.test(s), 'names wrap; nothing truncated');
});

// ── Invite ─────────────────────────────────────────────────────────────────

test('invite: owner / admin only (household.invite), hidden for adult and child', () => {
  assert.equal(hasHouseholdPermission('owner', 'household.invite'), true);
  assert.equal(hasHouseholdPermission('admin', 'household.invite'), true);
  assert.equal(hasHouseholdPermission('adult', 'household.invite'), false);
  assert.equal(hasHouseholdPermission('child', 'household.invite'), false);
  assert.deepEqual(buildInviteCard(input({ canInvite: false })), { kind: 'hidden' });
  const s = code(SCREEN);
  assert.ok(s.includes('useAppStore(selectCanInviteMembers)'));
  assert.ok(s.includes("if (card.kind === 'hidden') return null;"));
  assert.ok(s.includes('useActiveInvites(household?.id ?? null, canInvite)'));
  // The hook does nothing without permission (RLS stays the authority).
  assert.ok(/if \(!enabled \|\| !householdId\) return;/.test(code(HOOK)));
});

test('invite: shows the real code (unchanged format), its role and the newest usable one', () => {
  const card = buildInviteCard(input());
  assert.equal(card.kind, 'code');
  if (card.kind !== 'code') return;
  assert.equal(card.code, 'K7QX92MD', 'the stored code as is, no reformatting');
  assert.equal(card.forLabel, 'Child code');
  const two = buildInviteCard(input({ invites: { kind: 'ready', invites: [
    invite('old', { code: 'OLD11111', created_at: at(-9) }),
    invite('new', { code: 'NEW22222', role: 'adult', created_at: at(-1) }),
  ] } }));
  assert.ok(two.kind === 'code' && two.code === 'NEW22222' && two.forLabel === 'Adult code' && two.moreLabel === '1 more active code in Settings');
  const three = buildInviteCard(input({ invites: { kind: 'ready', invites: [invite('a'), invite('b', { created_at: at(-2) }), invite('c', { created_at: at(-3) })] } }));
  assert.ok(three.kind === 'code' && three.moreLabel === '2 more active codes in Settings');
  assert.ok(!/K7QX-92MD|K7QX92MD/.test(code(SCREEN) + code(MODEL)), 'no hard-coded code');
});

test('invite: only codes the server would accept (A4 rule)', () => {
  assert.equal(isUsableInvite(invite('c', { role: 'child', redemption_count: 3 }), NOW), true, 'child codes are multi-use');
  assert.equal(isUsableInvite(invite('a', { role: 'adult', redemption_count: 1 }), NOW), false, 'adult codes are single-use');
  assert.equal(isUsableInvite(invite('d', { role: 'admin', redemption_count: 1 }), NOW), false);
  assert.equal(isUsableInvite(invite('e', { role: 'admin' }), NOW), true);
  assert.equal(isUsableInvite(invite('r', { revoked_at: at(-1) }), NOW), false);
  assert.equal(isUsableInvite(invite('x', { expires_at: at(-0.01) }), NOW), false);
  const mig = raw('../supabase/migrations/20260903000000_a4_invite_lifecycle_reconciliation.sql');
  assert.ok(/-- Adult\/Admin are single-use for NEW memberships\.[\s\S]{0,200}redemption_count > 0/.test(mig));
  const usedOnly = buildInviteCard(input({ invites: { kind: 'ready', invites: [invite('a', { role: 'adult', redemption_count: 1 })] } }));
  assert.deepEqual(usedOnly, { kind: 'none', text: 'No active invite code. Generate one in Settings.' });
});

test('invite: validity is the truth from expires_at, not a fixed "30 days"', () => {
  assert.equal(validityLabel(at(30), NOW), 'Valid for 30 more days');
  assert.equal(validityLabel(at(23), NOW), 'Valid for 23 more days');
  assert.equal(validityLabel(at(0.2), NOW), 'Valid for 1 more day');
  assert.equal(validityLabel(at(1), NOW), 'Valid for 1 more day');
  assert.equal(validityLabel(at(1.5), NOW), 'Valid for 2 more days');
  assert.equal(validityLabel(at(-1), NOW), null);
  assert.equal(daysLeft(at(29.9), NOW), 30);
  const card = buildInviteCard(input());
  assert.ok(card.kind === 'code' && card.validityLabel === 'Valid for 23 more days');
  assert.ok(raw('../supabase/migrations/20260706120000_household_invites.sql').includes("expires_at            timestamptz           NOT NULL DEFAULT (now() + interval '30 days')"));
  assert.ok(!/Valid 30 days|valid 30 days/.test(FAM_COPY + code(SCREEN)));
});

test('invite: loading / error / none render honestly; nothing is fabricated', () => {
  assert.deepEqual(buildInviteCard(input({ invites: { kind: 'loading' } })), { kind: 'loading', text: 'Loading invite code…' });
  assert.equal(buildInviteCard(input({ invites: { kind: 'error' } })).kind, 'error');
  assert.deepEqual(buildInviteCard(input({ invites: { kind: 'ready', invites: [] } })), { kind: 'none', text: 'No active invite code. Generate one in Settings.' });
  // The same query Settings → Invites uses; no write anywhere in Family.
  assert.ok(code(HOOK).includes('getActiveHouseholdInvites(householdId)'));
  assert.ok(!/createHouseholdInvite|revokeHouseholdInvite|insert|update\(/.test(code(HOOK) + code(SCREEN)));
  // Pull-to-refresh re-reads invites too; focus re-reads them.
  assert.ok(code(SCREEN).includes('useHouseholdRefreshControl(canInvite ? invites.reload : undefined)'));
  assert.ok(code(HOOK).includes('useFocusEffect('));
});

test('invite: Share uses the system share sheet with the real code; clipboard fallback where none exists', () => {
  const card = buildInviteCard(input());
  assert.ok(card.kind === 'code');
  if (card.kind !== 'code') return;
  assert.equal(card.shareMessage, 'Join The Cohen family on ChoreHero. Invite code: K7QX92MD');
  assert.equal(card.shareA11y, 'Share invite code K7QX92MD');
  const noName = buildInviteCard(input({ householdName: null }));
  assert.ok(noName.kind === 'code' && noName.shareMessage === 'Join our family on ChoreHero. Invite code: K7QX92MD');
  const s = code(SCREEN);
  assert.ok(/await Share\.share\(\{ message: card\.shareMessage \}\);/.test(s));
  assert.ok(/catch \{[\s\S]*?Clipboard\.setStringAsync\(card\.code\)/.test(s));
  assert.ok(/if \(card\.kind !== 'code' \|\| sharing\) return;/.test(s), 'one share at a time');
  // Nothing but the code and household name leaves the app.
  assert.ok(!/email|token|password|household\.id|householdId/.test(card.shareMessage));
});

// ── Settings / navigation ──────────────────────────────────────────────────

test('settings: Family → Settings and Home avatar → Settings are the same route; Settings is not a tab', () => {
  assert.deepEqual([...ADULT_TABS], ['Home', 'Tasks', 'Rewards', 'Family']);
  assert.deepEqual([...CHILD_TABS], ['Home', 'Missions', 'Rewards', 'Me']);
  assert.ok(!(ADULT_TABS as readonly string[]).includes('Settings'));
  assert.ok(STACK_ROUTES.adult.includes('Settings'));
  assert.deepEqual([...settingsEntryPoints('adult')], ['homeAvatar', 'familySettingsLink']);
  const shell = code(SHELL);
  assert.ok(/function useOpenSettings\(\) \{[\s\S]*?return \(\) => navigation\.navigate\('Settings'\);/.test(shell));
  assert.ok(/function AdultFamilyTab\(\) \{\s*const openSettings = useOpenSettings\(\);\s*return <AdultFamilyScreen onOpenSettings=\{openSettings\} \/>;/.test(shell));
  assert.ok(/function AdultHomeTab\(\)[\s\S]*?const openSettings = useOpenSettings\(\);[\s\S]*?onOpenSettings=\{openSettings\}/.test(shell));
  assert.ok(shell.includes('<AdultTab.Screen name="Family"  component={AdultFamilyTab}'));
  assert.ok(/onPress=\{onOpenSettings\}[\s\S]{0,120}accessibilityLabel=\{model\.settings\.label\}/.test(code(SCREEN)));
  assert.ok(!/useNavigation|navigation\.navigate|navigate\(/.test(code(SCREEN)), 'the screen never navigates');
});

test('function preservation: everything the old Family offered is still reachable', () => {
  // Settings (reached from Family → Settings) keeps profile details, the
  // household name, the full invite management, About and Sign out.
  assert.deepEqual(visibleSettingsSections({ isAuthenticated: true, hasActiveHousehold: true, canInviteMembers: true }), ['profile', 'household', 'invites', 'about', 'session']);
  const settings = code('screens/SettingsScreen.tsx');
  assert.ok(settings.includes('<HouseholdInvitesSection') && settings.includes('<ProfileEditModal') && settings.includes('onPress={confirmSignOut}'));
  const invites = code('features/household/components/HouseholdInvitesSection.tsx');
  assert.ok(invites.includes('createInvite(') && invites.includes('revokeInvite(') && invites.includes('INVITABLE_ROLES.map('));
  // Family itself: profile, household name, members, current invite, Settings.
  const s = code(SCREEN);
  for (const e of ['model.profile.line', 'model.members.rows.map(', '<InviteSection card={model.invite} />', 'onPress={onOpenSettings}', '<ProfileEditModal']) assert.ok(s.includes(e), e);
});

test('reading order: header → profile → members → invite → Settings', () => {
  const s = code(SCREEN);
  const order = ["copy.adultFamily.title", 'model.profile.a11yLabel', 'model.members.heading', '<InviteSection card={model.invite} />', 'accessibilityLabel={model.settings.label}'].map((e) => s.indexOf(e));
  assert.ok(order.every((i) => i > 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

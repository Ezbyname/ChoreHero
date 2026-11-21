// App-wide UI consistency (#15): every user-facing screen is built from the
// shared primitives in src/components/ui and the theme tokens, so the tabs,
// sheets, dialogs, auth and onboarding read as one app.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const SRC = new URL('../../', import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8');
const code = (rel: string) => read(rel).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

function tsxFiles(dirRel: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(new URL(rel, SRC))) {
      const child = `${rel}${name}`;
      if (statSync(new URL(child, SRC)).isDirectory()) { if (name !== '__tests__') walk(`${child}/`); }
      else if (name.endsWith('.tsx')) out.push(child);
    }
  };
  walk(dirRel);
  return out;
}

const ALL_UI = [...tsxFiles('screens/'), ...tsxFiles('features/'), ...tsxFiles('components/'), ...tsxFiles('navigation/')];

test('no hard-coded colours outside the theme', () => {
  const offenders = ALL_UI.filter((f) => /['"]#[0-9A-Fa-f]{3,8}['"]|rgba?\(/.test(code(f)));
  assert.deepEqual(offenders, []);
});

test('auth + onboarding + recovery screens all use FormScreen (safe area, keyboard avoidance, scroll)', () => {
  for (const f of [
    'screens/auth/AuthWelcomeScreen.tsx', 'screens/auth/LoginScreen.tsx', 'screens/auth/SignupScreen.tsx',
    'screens/auth/ForgotPasswordScreen.tsx', 'screens/ResetPasswordScreen.tsx', 'screens/RecoveryLinkExpiredScreen.tsx',
    'screens/EmailConfirmedScreen.tsx', 'screens/ProfileSetupScreen.tsx', 'screens/HouseholdSetupScreen.tsx',
  ]) {
    const src = code(f);
    assert.ok(src.includes('<FormScreen'), f);
    assert.ok(!/KeyboardAvoidingView/.test(src), `${f} should not hand-roll keyboard handling`);
  }
});

test('one button system: no hand-built TouchableOpacity buttons outside a short, justified allow-list', () => {
  const allowed = new Set([
    'components/ActivityCard.tsx',      // inline "Show more" text link
    'screens/auth/LoginScreen.tsx',     // Show password checkbox (device-QA verified)
    'screens/AssignedByMeScreen.tsx',   // assignee / due-date chips
  ]);
  const offenders = ALL_UI.filter((f) => code(f).includes('<TouchableOpacity') && !allowed.has(f));
  assert.deepEqual(offenders, []);
});

test('one input style: raw TextInput only inside TextField; the Helpful row reuses fieldStyles', () => {
  const offenders = ALL_UI.filter((f) => code(f).includes('<TextInput') && f !== 'components/ui/TextField.tsx' && f !== 'screens/TodayScreen.tsx' && f !== 'screens/NewRewardScreen.tsx');
  assert.deepEqual(offenders, []);
  assert.ok(code('screens/TodayScreen.tsx').includes('...fieldStyles.input'));
  // Slice 6C: the Points cost stepper's value is the shared field style too.
  assert.ok(code('screens/NewRewardScreen.tsx').includes('...fieldStyles.input'));
});

test('every bottom sheet has the shared header with an X; every centred confirmation uses ConfirmDialog', () => {
  for (const f of [
    'features/tasks/components/TaskCompletionModal.tsx', 'features/tasks/components/TaskReviewEvidenceModal.tsx',
    'features/tasks/components/PendingCompletionModal.tsx', 'features/profile/ProfileEditModal.tsx',
  ]) assert.ok(code(f).includes('<SheetHeader'), f);
  for (const f of [
    'features/rewards/components/ConfirmRewardRequestModal.tsx', 'features/rewards/components/ConfirmRewardReviewModal.tsx',
    'features/rewards/components/CancelRewardRequestModal.tsx',
  ]) {
    const src = code(f);
    assert.ok(src.includes('<ConfirmDialog'), f);
    assert.ok(!src.includes('<Modal'), f);
  }
});

test('errors and confirmations use Banner everywhere, not ad-hoc red text boxes', () => {
  const offenders = ALL_UI.filter((f) => /errorBox|errorText:/.test(code(f)));
  assert.deepEqual(offenders, []);
});

test('Rewards, RewardCard and the invites section use the shared card / section / button system', () => {
  const rewards = code('screens/RewardsScreen.tsx');
  assert.ok(rewards.includes('<SectionHeader') && rewards.includes('<Card') && rewards.includes('<TextField') && rewards.includes('<AppButton'));
  const card = code('features/rewards/components/RewardCard.tsx');
  assert.ok(card.includes('<Card') && card.includes('<StatusPill') && card.includes('<AppButton'));
  const invites = code('features/household/components/HouseholdInvitesSection.tsx');
  assert.ok(invites.includes('<Card') && invites.includes('<AppButton'));
});

// App-shell behaviour from the device QA list: navigation origin, photo
// submission never showing the global loading screen, sounds, startup
// splash, Settings order, Helpful-claim explanation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import { createSoundTrigger, type AppSoundEvent } from '@/features/sounds/soundTrigger';
import {
  SPLASH_IMAGE_COUNT,
  SPLASH_MAX_VISIBLE_MS,
  SPLASH_MIN_VISIBLE_MS,
  isStartupReady,
  pickSplashIndex,
  shouldDismissSplash,
} from '@/features/startup/startupSplashRules';
import { SETTINGS_SECTION_ORDER, visibleSettingsSections } from '@/screens/settingsLayout';
import { deriveClaimFormView, onClaimSubmitResult } from '@/features/contributions/claimContributionFormState';

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// ── Navigation origin (Cancel from My Tasks used to land on Today) ──────────

test('completion / pending sheets are hosted by the screen that opened them; no flow navigates or re-hydrates', () => {
  for (const rel of ['../../screens/TodayScreen.tsx', '../../screens/MyTasksScreen.tsx']) {
    const src = code(rel);
    assert.ok(src.includes('<PendingCompletionModal'), rel);
    assert.ok(src.includes('<TaskCompletionModal'), rel);
    assert.ok(!/navigation\.navigate|navigate\(|useNavigation|requestAppDataHydrationRetry/.test(src), rel);
  }
  for (const rel of ['../tasks/components/PendingCompletionModal.tsx', '../tasks/components/TaskCompletionModal.tsx', '../tasks/components/TaskReviewEvidenceModal.tsx', '../tasks/childPendingCompletion.ts']) {
    const src = code(rel);
    assert.ok(!/navigate\(|useNavigation|requestAppDataHydrationRetry|startHydrationRun/.test(src), rel);
  }
});

test('the only re-hydration callers left are onboarding recovery screens and the explicit error-screen retry', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = `${dir}/${name}`;
      if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      const src = readFileSync(p, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
      if (/requestAppDataHydrationRetry\(\);/.test(src)) offenders.push(p.slice(p.indexOf('src/')).replace(/\/+/g, '/'));
    }
  };
  walk(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  assert.deepEqual(offenders.sort(), ['src/screens/HouseholdSetupScreen.tsx', 'src/screens/ProfileSetupScreen.tsx']);
  // The hydration error screen passes the action to its Try again button
  // (user-initiated only); it never calls it by itself.
  const gate = code('../../navigation/AuthenticatedAppGate.tsx');
  assert.ok(gate.includes('onRetry={requestAppDataHydrationRetry}'));
  assert.ok(!gate.includes('requestAppDataHydrationRetry()'));
});

test('the startup splash is never used for submission progress; submission progress is inline in the sheet', () => {
  const sheet = code('../tasks/components/TaskCompletionModal.tsx');
  assert.ok(sheet.includes('copy.completionSheet.uploadingPhoto'));
  assert.ok(!/StartupSplash|LoadingView/.test(sheet));
  for (const rel of ['../../screens/TodayScreen.tsx', '../../screens/MyTasksScreen.tsx']) {
    assert.ok(!code(rel).includes('StartupSplash'), rel);
  }
});

// ── Sounds ──────────────────────────────────────────────────────────────────

test('sounds: each success plays once per submission; re-renders / duplicate callbacks never replay', () => {
  const played: AppSoundEvent[] = [];
  const t = createSoundTrigger({ play: (e) => { played.push(e); } });
  assert.equal(t.play('completion_submitted', 'sub-1'), true);
  assert.equal(t.play('completion_submitted', 'sub-1'), false);
  assert.equal(t.play('completion_withdrawn', 'sub-1'), true);
  assert.equal(t.play('completion_submitted', 'sub-2'), true);
  assert.deepEqual(played, ['completion_submitted', 'completion_withdrawn', 'completion_submitted']);
});

test('sounds: a failing player never breaks the flow', () => {
  const t1 = createSoundTrigger({ play: () => { throw new Error('no audio'); } });
  assert.equal(t1.play('completion_submitted', 'a'), true);
  const t2 = createSoundTrigger({ play: () => Promise.reject(new Error('no audio')) });
  assert.equal(t2.play('completion_submitted', 'a'), true);
});

test('sounds are played only on confirmed success paths', () => {
  const today = code('../../screens/TodayScreen.tsx');
  assert.ok(/onCompleted=\{\(submission\) => \{\s*if \(submission\) appSounds\.play\('completion_submitted', submission\.id\);/.test(today));
  const pending = code('../tasks/components/PendingCompletionModal.tsx');
  assert.ok(/if \(result\.ok\) appSounds\.play\('completion_withdrawn', begun\.pending\.submissionId\);/.test(pending));
  const sheet = code('../tasks/components/TaskCompletionModal.tsx');
  assert.ok(/if \(outcome\.completed\) onCompleted\(outcome\.submission\);/.test(sheet));
});

test('bundled sound assets exist and are short original WAVs', () => {
  for (const name of ['completion-submitted.wav', 'completion-withdrawn.wav']) {
    const bytes = readFileSync(new URL(`../../../assets/sounds/${name}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.ok(bytes.length < 40_000, name);
  }
});

// ── Startup splash ──────────────────────────────────────────────────────────

test('splash: random index is always a valid image (and per process, not per render)', () => {
  assert.equal(pickSplashIndex(() => 0), 0);
  assert.equal(pickSplashIndex(() => 0.999999), SPLASH_IMAGE_COUNT - 1);
  assert.equal(pickSplashIndex(() => 1), SPLASH_IMAGE_COUNT - 1);
  assert.equal(pickSplashIndex(() => Number.NaN), 0);
  const seen = new Set<number>();
  for (let i = 0; i < SPLASH_IMAGE_COUNT; i++) seen.add(pickSplashIndex(() => (i + 0.5) / SPLASH_IMAGE_COUNT));
  assert.equal(seen.size, SPLASH_IMAGE_COUNT);
  const src = code('../startup/StartupSplash.tsx');
  assert.ok(/^const chosenIndex = pickSplashIndex/m.test(src), 'chosen at module level');
  assert.ok(!src.includes('OneDrive') && !src.includes('Desktop'));
});

test('splash: stays ~4.5 s, then lifts only when startup is ready (no fallback to the old text screen)', () => {
  assert.equal(SPLASH_MIN_VISIBLE_MS, 4500);
  assert.equal(shouldDismissSplash({ elapsedMs: 1000, ready: true }), false);
  assert.equal(shouldDismissSplash({ elapsedMs: 4500, ready: true }), true);
  assert.equal(shouldDismissSplash({ elapsedMs: 9000, ready: false }), false);
  assert.equal(shouldDismissSplash({ elapsedMs: SPLASH_MAX_VISIBLE_MS, ready: false }), true);
});

test('splash: startup ready = auth known and (signed out, or first hydration finished)', () => {
  const base = { supabaseConfigured: true, isAuthResolved: true, isAuthLoading: false, isAuthenticated: true, appHydrationState: 'loading' as const };
  assert.equal(isStartupReady(base), false);
  assert.equal(isStartupReady({ ...base, appHydrationState: 'hydrated' }), true);
  assert.equal(isStartupReady({ ...base, appHydrationState: 'partial' }), true);
  assert.equal(isStartupReady({ ...base, appHydrationState: 'error' }), true);
  assert.equal(isStartupReady({ ...base, isAuthenticated: false }), true);
  assert.equal(isStartupReady({ ...base, isAuthResolved: false }), false);
  assert.equal(isStartupReady({ ...base, supabaseConfigured: false, isAuthResolved: false }), true);
});

test('splash assets: 8 bundled WebP images, reasonable size, no runtime path outside the app', () => {
  const dir = new URL('../../../assets/splash/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.webp')).sort();
  assert.equal(files.length, SPLASH_IMAGE_COUNT);
  let total = 0;
  for (const f of files) {
    const b = readFileSync(new URL(f, dir));
    assert.equal(b.subarray(8, 12).toString('ascii'), 'WEBP');
    total += b.length;
  }
  assert.ok(total < 2.5 * 1024 * 1024, `total ${total}`);
});

test('the old "Getting your ChoreHero ready" text screen is gone', () => {
  for (const rel of ['../../navigation/AuthenticatedAppGate.tsx', '../../navigation/AuthGate.tsx']) {
    assert.ok(!/Getting (your )?ChoreHero ready/.test(code(rel)), rel);
  }
});

// ── Settings ────────────────────────────────────────────────────────────────

test('Settings: Sign Out is the very last section, for every role combination', () => {
  assert.equal(SETTINGS_SECTION_ORDER.at(-1), 'session');
  for (const hasActiveHousehold of [true, false]) for (const canInviteMembers of [true, false]) {
    const v = visibleSettingsSections({ isAuthenticated: true, hasActiveHousehold, canInviteMembers });
    assert.equal(v.at(-1), 'session');
    assert.equal(v.filter((s) => s === 'session').length, 1);
  }
  assert.ok(!visibleSettingsSections({ isAuthenticated: false, hasActiveHousehold: false, canInviteMembers: false }).includes('session'));
});

test('Settings: sign out is confirmed first and styled as a destructive session action; Profile is reachable', () => {
  const s = code('../../screens/SettingsScreen.tsx');
  assert.ok(/Alert\.alert\(\s*copy\.settingsScreen\.signOutConfirmTitle/.test(s));
  assert.ok(/style: 'destructive', onPress: \(\) => \{ void doSignOut\(\); \}/.test(s));
  assert.ok(/variant="dangerOutline"[\s\S]*?onPress=\{confirmSignOut\}/.test(s));
  assert.ok(s.includes('<ProfileEditModal'));
  assert.ok(s.includes('copy.settingsScreen.editProfile'));
});

// ── Helpful action ──────────────────────────────────────────────────────────

test('Helpful: while one claim is pending the form is replaced by its status AND the one-at-a-time rule', () => {
  const sent = deriveClaimFormView(onClaimSubmitResult({ ok: true }, 'Fed the dog'), 'Fed the dog');
  assert.equal(sent.kind, 'sent');
  assert.equal(deriveClaimFormView({ kind: 'idle' }, 'Fed the dog').kind, 'waiting');
  assert.equal(deriveClaimFormView({ kind: 'idle' }, null).kind, 'form');
  const today = code('../../screens/TodayScreen.tsx');
  assert.ok(/view\.kind === 'form' \?[\s\S]*?:\s*\([\s\S]*?copy\.contributionClaims\.onePendingRuleBody/.test(today));
  // Existing guarantees kept: first tap works with the keyboard up.
  assert.ok(today.includes('keyboardShouldPersistTaps="handled"'));
  assert.ok(today.includes('Keyboard.dismiss()'));
});

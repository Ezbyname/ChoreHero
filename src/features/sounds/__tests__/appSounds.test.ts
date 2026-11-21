// Focused sound tests. The trigger rules run for real; the expo-audio
// wiring (native) is checked structurally, since Node cannot load it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { uiAudioModeFor } from '@/features/sounds/audioMode';
import { createSoundTrigger, type AppSoundEvent } from '@/features/sounds/soundTrigger';

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

function recorder() {
  const played: AppSoundEvent[] = [];
  return { played, trigger: createSoundTrigger({ play: (e) => { played.push(e); } }) };
}

test('submit and withdraw are two DIFFERENT sounds (different events, different files)', () => {
  const src = code('../appSounds.ts');
  assert.ok(src.includes("completion_submitted: require('../../../assets/sounds/completion-submitted.wav')"));
  assert.ok(src.includes("completion_withdrawn: require('../../../assets/sounds/completion-withdrawn.wav')"));
  const a = readFileSync(new URL('../../../../assets/sounds/completion-submitted.wav', import.meta.url));
  const b = readFileSync(new URL('../../../../assets/sounds/completion-withdrawn.wav', import.meta.url));
  assert.notDeepEqual(a, b);
});

test('duplicate delivery (re-render, repeated callback, Realtime echo) never replays', () => {
  const { played, trigger } = recorder();
  for (let i = 0; i < 5; i++) trigger.play('completion_submitted', 'sub-1');
  for (let i = 0; i < 3; i++) trigger.play('completion_withdrawn', 'sub-1');
  assert.deepEqual(played, ['completion_submitted', 'completion_withdrawn']);
});

test('a new attempt (new submission id) plays again', () => {
  const { played, trigger } = recorder();
  trigger.play('completion_submitted', 'sub-1');
  trigger.play('completion_withdrawn', 'sub-1');
  trigger.play('completion_submitted', 'sub-2');
  assert.deepEqual(played, ['completion_submitted', 'completion_withdrawn', 'completion_submitted']);
});

test('never on failure: every call site is behind a confirmed success', () => {
  for (const rel of ['../../../screens/TodayScreen.tsx', '../../../screens/MyTasksScreen.tsx']) {
    const src = code(rel);
    // Only inside onCompleted, which the sheet calls only when outcome.completed.
    assert.ok(/onCompleted=\{\(submission\) => \{\s*if \(submission\) appSounds\.play\('completion_submitted', submission\.id\);/.test(src), rel);
    assert.equal((src.match(/appSounds\.play\(/g) ?? []).length, 1, rel);
  }
  const sheet = code('../../tasks/components/TaskCompletionModal.tsx');
  assert.ok(/if \(outcome\.completed\) onCompleted\(outcome\.submission\);/.test(sheet));
  assert.ok(!sheet.includes('appSounds'));
  const pending = code('../../tasks/components/PendingCompletionModal.tsx');
  assert.ok(/if \(result\.ok\) appSounds\.play\('completion_withdrawn', begun\.pending\.submissionId\);/.test(pending));
  assert.equal((pending.match(/appSounds\.play\(/g) ?? []).length, 1);
});

test('device audio mode: Android plays on vibrate/silent (media volume decides); iOS keeps the silent switch', () => {
  // Phase 1 RCA: expo-audio's Android play() is a silent no-op unless
  // playsInSilentMode is true or the ringer is NORMAL — with false, a phone
  // on vibrate never heard a sound.
  const android = uiAudioModeFor('android');
  assert.equal(android.playsInSilentMode, true);
  const ios = uiAudioModeFor('ios');
  assert.equal(ios.playsInSilentMode, false);
  for (const mode of [android, ios, uiAudioModeFor('web')]) {
    assert.equal(mode.interruptionMode, 'mixWithOthers');
    assert.equal(mode.shouldPlayInBackground, false);
    assert.equal(mode.allowsRecording, false);
  }
});

test('the player applies the platform audio mode once, before the first sound; no recording APIs', () => {
  const src = code('../appSounds.ts');
  assert.ok(src.includes("from 'expo-audio'"));
  assert.ok(src.includes('const AUDIO_MODE = uiAudioModeFor(Platform.OS);'));
  assert.ok(/if \(!audioModeRequested\) \{\s*audioModeRequested = true;\s*await setAudioModeAsync\(AUDIO_MODE\)/.test(src));
  assert.ok(!/playsInSilentMode:\s+false/.test(src), 'no hard-coded silent-mode override left in the player');
  assert.ok(!/useAudioRecorder|requestRecordingPermissionsAsync|https?:\/\//.test(src));
});

test('failures play nothing: the trigger is only reached from a confirmed success', () => {
  const { played, trigger } = recorder();
  // what a failed submit / withdraw does: no play() call at all
  assert.deepEqual(played, []);
  trigger.play('completion_submitted', 'sub-9');
  trigger.play('completion_withdrawn', 'sub-9');
  assert.deepEqual(played, ['completion_submitted', 'completion_withdrawn'], 'two distinct sounds, once each');
});

test('no expo-audio config plugin (it would add RECORD_AUDIO + a foreground media service)', () => {
  const cfg = readFileSync(new URL('../../../../app.config.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../../../../app.json', import.meta.url), 'utf8');
  assert.ok(!cfg.includes('expo-audio'));
});

test('dependency: expo-audio pinned to the SDK 56 line', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.dependencies['expo-audio'], /^~56\.0\.\d+$/);
});

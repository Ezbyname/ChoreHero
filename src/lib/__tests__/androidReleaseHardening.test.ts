// Android Production hardening (pre-first-build): approved ChoreHero launcher
// artwork instead of the Expo template placeholder, unused permissions
// blocked, Android backup disabled. app.json is the authoritative source —
// the native android/ project is generated (CNG) on every EAS build.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const appJson = JSON.parse(readFileSync(new URL('app.json', root), 'utf8'));
const android = appJson.expo.android;

// SHA-256 of the Expo template placeholder assets shipped before hardening.
const EXPO_PLACEHOLDER_SHA256 = new Set([
  '119462bb78eb240a65c869fc067ee599639b3cb5a41953f25c07b17d2a8c7e0f', // icon.png
  '9e3d0315a33c6799de601dd34cd8bf8cc3a8d16f3bf75592baec2ceb7240b391', // android-icon-foreground.png
  'fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d', // android-icon-background.png
  '6371fc2c12e33ad2215a86c281db3d682a81bebe7c957a842c13b8bf00cceb83', // android-icon-monochrome.png
]);

function png(rel: string) {
  const buf = readFileSync(new URL(rel.replace(/^\.\//, ''), root));
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${rel} is a PNG`);
  return {
    width:  buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25], // 2 = RGB, 6 = RGBA
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

test('launcher icons are the approved ChoreHero artwork, never the Expo placeholder', () => {
  const paths = [
    appJson.expo.icon,
    android.adaptiveIcon.foregroundImage,
    android.adaptiveIcon.backgroundImage,
    android.adaptiveIcon.monochromeImage,
  ];
  for (const p of paths) {
    const img = png(p);
    assert.ok(!EXPO_PLACEHOLDER_SHA256.has(img.sha256), `${p} is still the Expo placeholder`);
    assert.equal(img.width, 1024, `${p} width`);
    assert.equal(img.height, 1024, `${p} is square`);
  }
  // Adaptive foreground/monochrome need transparency around the safe-zone content.
  assert.equal(png(android.adaptiveIcon.foregroundImage).colorType, 6);
  assert.equal(png(android.adaptiveIcon.monochromeImage).colorType, 6);
  assert.match(android.adaptiveIcon.backgroundColor, /^#42AC01$/i);
});

test('Play store icon is a 512x512 PNG kept in the repo (not referenced by the app)', () => {
  const img = png('assets/store/play-store-icon-512.png');
  assert.equal(img.width, 512);
  assert.equal(img.height, 512);
});

test('unused Android permissions are blocked; required ones are not', () => {
  assert.deepEqual([...android.blockedPermissions].sort(), [
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.RECORD_AUDIO',
    'android.permission.SYSTEM_ALERT_WINDOW',
  ]);
  for (const required of ['CAMERA', 'INTERNET', 'ACCESS_NETWORK_STATE', 'VIBRATE', 'WAKE_LOCK']) {
    assert.ok(!android.blockedPermissions.some((p: string) => p.endsWith(`.${required}`)), required);
  }
});

test('Android backup is disabled (session data never enters device backup)', () => {
  assert.equal(android.allowBackup, false);
});

test('no owner-local or absolute paths leak into app config', () => {
  const raw = readFileSync(new URL('app.json', root), 'utf8');
  assert.ok(!/OneDrive|[A-Za-z]:\\|\/Users\//.test(raw));
});

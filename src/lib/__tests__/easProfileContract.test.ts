import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Structural contract test — parses eas.json as JSON (never source-text
// grep) so a drifted profile mapping fails loudly here rather than being
// discovered only at a real EAS build. This is Layer 1 of the three-layer
// build safety model (see config/appVariant.ts for Layer 3, the backend
// target guard).
const currentDir = dirname(fileURLToPath(import.meta.url));
const easJsonPath = join(currentDir, '..', '..', '..', 'eas.json');
const easConfig = JSON.parse(readFileSync(easJsonPath, 'utf8'));

test('eas.json defines exactly the three approved build profiles, no more, no fewer', () => {
  const profileNames = Object.keys(easConfig.build ?? {}).sort();
  assert.deepEqual(profileNames, ['development', 'preview', 'production']);
});

test('every approved profile sets an explicit APP_VARIANT', () => {
  for (const profileName of ['development', 'preview', 'production']) {
    const value = easConfig.build[profileName]?.env?.APP_VARIANT;
    assert.ok(
      typeof value === 'string' && value.length > 0,
      `profile "${profileName}" is missing a non-empty env.APP_VARIANT`,
    );
  }
});

test('development profile maps to APP_VARIANT=development and environment=development', () => {
  const profile = easConfig.build.development;
  assert.equal(profile.env.APP_VARIANT, 'development');
  assert.equal(profile.environment, 'development');
});

test('preview profile maps to APP_VARIANT=qa, environment=preview, internal APK distribution', () => {
  const profile = easConfig.build.preview;
  assert.equal(profile.env.APP_VARIANT, 'qa');
  assert.equal(profile.environment, 'preview');
  assert.equal(profile.distribution, 'internal');
  assert.equal(profile.android.buildType, 'apk');
});

test('production profile maps to APP_VARIANT=production and environment=production', () => {
  const profile = easConfig.build.production;
  assert.equal(profile.env.APP_VARIANT, 'production');
  assert.equal(profile.environment, 'production');
});

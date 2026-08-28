import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractProjectRef,
  getVariantIdentity,
  resolveVariant,
  validateBackendTarget,
} from '../../../config/appVariant';

const QA_URL = 'https://umzfyedxnvtmfnwldwtq.supabase.co';
const PRODUCTION_URL = 'https://aqjiweueckwnkczcyedu.supabase.co';

test('resolveVariant accepts exactly the three approved variants', () => {
  assert.deepEqual(resolveVariant('development'), { ok: true, variant: 'development' });
  assert.deepEqual(resolveVariant('qa'), { ok: true, variant: 'qa' });
  assert.deepEqual(resolveVariant('production'), { ok: true, variant: 'production' });
});

test('resolveVariant rejects unknown/near-miss values with no normalization', () => {
  for (const bad of ['staging', 'prodution', 'QA', 'Production', 'dev']) {
    const result = resolveVariant(bad);
    assert.equal(result.ok, false);
  }
});

test('development resolves to the approved identity', () => {
  assert.deepEqual(getVariantIdentity('development'), {
    name: 'ChoreHero Dev',
    androidPackage: 'com.ezbyname.chorehero.dev',
    iosBundleIdentifier: 'com.ezbyname.chorehero.dev',
    scheme: 'chorehero-dev',
    expectedBackendProjectRef: 'umzfyedxnvtmfnwldwtq',
  });
});

test('qa resolves to the approved identity', () => {
  assert.deepEqual(getVariantIdentity('qa'), {
    name: 'ChoreHero QA',
    androidPackage: 'com.ezbyname.chorehero.qa',
    iosBundleIdentifier: 'com.ezbyname.chorehero.qa',
    scheme: 'chorehero-qa',
    expectedBackendProjectRef: 'umzfyedxnvtmfnwldwtq',
  });
});

test('production resolves to the approved identity', () => {
  assert.deepEqual(getVariantIdentity('production'), {
    name: 'ChoreHero',
    androidPackage: 'com.ezbyname.chorehero',
    iosBundleIdentifier: 'com.ezbyname.chorehero',
    scheme: 'chorehero',
    expectedBackendProjectRef: 'aqjiweueckwnkczcyedu',
  });
});

test('extractProjectRef parses a well-formed Supabase URL', () => {
  assert.equal(extractProjectRef(QA_URL), 'umzfyedxnvtmfnwldwtq');
});

test('extractProjectRef rejects malformed/non-Supabase/missing URLs', () => {
  assert.equal(extractProjectRef('not-a-url'), null);
  assert.equal(extractProjectRef('https://example.com'), null);
  assert.equal(extractProjectRef('https://umzfyedxnvtmfnwldwtq.example.com'), null);
  assert.equal(extractProjectRef(undefined), null);
});

test('backend target guard: development + QA = PASS', () => {
  assert.deepEqual(validateBackendTarget('development', QA_URL), { ok: true });
});

test('backend target guard: qa + QA = PASS', () => {
  assert.deepEqual(validateBackendTarget('qa', QA_URL), { ok: true });
});

test('backend target guard: production + Production = PASS', () => {
  assert.deepEqual(validateBackendTarget('production', PRODUCTION_URL), { ok: true });
});

test('backend target guard: development + Production = FAIL', () => {
  assert.equal(validateBackendTarget('development', PRODUCTION_URL).ok, false);
});

test('backend target guard: qa + Production = FAIL', () => {
  assert.equal(validateBackendTarget('qa', PRODUCTION_URL).ok, false);
});

test('backend target guard: production + QA = FAIL', () => {
  assert.equal(validateBackendTarget('production', QA_URL).ok, false);
});

test('backend target guard: malformed URL fails safely', () => {
  assert.equal(validateBackendTarget('production', 'not-a-url').ok, false);
});

test('backend target guard: missing URL with an explicit variant fails', () => {
  assert.equal(validateBackendTarget('production', undefined).ok, false);
});

test('backend target guard: unexpected project ref fails', () => {
  assert.equal(validateBackendTarget('qa', 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co').ok, false);
});

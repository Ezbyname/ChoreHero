import assert from 'node:assert/strict';
import test from 'node:test';
import { QA_PROJECT_REF, PRODUCTION_PROJECT_REF, extractProjectRef } from '@/lib/supabaseProjectRef';

// QA-01 — extracted from config/appVariant.ts so runtime code (src/) can
// reach this logic without importing that build-time-only file. Same
// cases as the pre-existing appVariant.test.ts, proving the extraction
// preserved behavior exactly.

test('extractProjectRef parses a well-formed Supabase URL', () => {
  assert.equal(extractProjectRef(`https://${QA_PROJECT_REF}.supabase.co`), QA_PROJECT_REF);
  assert.equal(extractProjectRef(`https://${PRODUCTION_PROJECT_REF}.supabase.co`), PRODUCTION_PROJECT_REF);
});

test('extractProjectRef rejects malformed/non-Supabase/missing URLs', () => {
  assert.equal(extractProjectRef('not-a-url'), null);
  assert.equal(extractProjectRef('https://example.com'), null);
  assert.equal(extractProjectRef(`https://${QA_PROJECT_REF}.example.com`), null);
  assert.equal(extractProjectRef(undefined), null);
});

test('QA and Production project refs are distinct', () => {
  assert.notEqual(QA_PROJECT_REF, PRODUCTION_PROJECT_REF);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { detectSessionInUrl } from '@/lib/supabaseAuthPlatform';

// This exercises the bare/Web variant only — the plain Node test runner has
// no path to supabaseAuthPlatform.native.ts (see aliasLoader.mjs), so that
// file's `false` variant is verified by TypeScript/build validation and
// real native execution instead, not here.
test('bare/Web detectSessionInUrl is true', () => {
  assert.equal(detectSessionInUrl, true);
});

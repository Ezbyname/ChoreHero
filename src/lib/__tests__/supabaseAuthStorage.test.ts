import assert from 'node:assert/strict';
import test from 'node:test';
import { supabaseAuthStorageOptions } from '@/lib/supabaseAuthStorage';

// This exercises the bare/Web variant only — the plain Node test runner has
// no path to supabaseAuthStorage.native.ts (see aliasLoader.mjs), so that
// file's AsyncStorage-backed variant is verified by TypeScript/build
// validation and real native execution instead, not here.
test('bare/Web storage options has no storage key at all', () => {
  assert.equal('storage' in supabaseAuthStorageOptions, false);
});

test('bare/Web storage options is otherwise empty', () => {
  assert.deepEqual(supabaseAuthStorageOptions, {});
});

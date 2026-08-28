import assert from 'node:assert/strict';
import test from 'node:test';
import { clearAuthRecoveryLink, useAuthRecoveryLink } from '@/lib/useAuthRecoveryLink';

// This exercises the bare/Web variant only — the plain Node test runner has
// no path to useAuthRecoveryLink.native.ts (see aliasLoader.mjs), so that
// file's real expo-linking-backed variant is verified by TypeScript/build
// validation and real native execution instead, not here.
test('bare/Web useAuthRecoveryLink always reports no incoming native URL', () => {
  assert.equal(useAuthRecoveryLink(), null);
});

test('bare/Web clearAuthRecoveryLink is a safe no-op', () => {
  assert.doesNotThrow(() => clearAuthRecoveryLink());
});

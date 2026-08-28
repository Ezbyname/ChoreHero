import assert from 'node:assert/strict';
import test from 'node:test';
import { getPasswordResetRedirectUrl } from '@/lib/passwordResetRedirect';

// This exercises the bare/Web variant only — the plain Node test runner has
// no path to passwordResetRedirect.native.ts (see aliasLoader.mjs), so that
// file's real expo-linking-backed variant is verified by TypeScript/build
// validation and real native execution instead, not here.
test('bare/Web redirect URL is undefined, preserving today\'s exact resetPasswordForEmail(email) call', () => {
  assert.equal(getPasswordResetRedirectUrl(), undefined);
});

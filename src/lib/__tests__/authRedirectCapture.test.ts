import assert from 'node:assert/strict';
import test from 'node:test';
import { capturedHash, capturedSearch } from '@/lib/authRedirectCapture';

// This exercises the bare/Web variant only — the plain Node test runner has
// no path to authRedirectCapture.native.ts (see aliasLoader.mjs). Node has
// no global `window` either, so this file's own `typeof window !==
// 'undefined'` guard is false here too, giving empty strings — the same
// values the native variant hardcodes (for a different, deliberate reason).
// The native file's own correctness is verified by TypeScript/build
// validation and real native execution, not here.
test('bare/Web capture with no window (as under Node) yields empty strings', () => {
  assert.equal(capturedHash, '');
  assert.equal(capturedSearch, '');
});

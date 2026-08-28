import assert from 'node:assert/strict';
import test from 'node:test';
import { useAuthRecoveryExit } from '@/lib/useAuthRecoveryExit';

// This exercises the bare/Web variant only — the plain Node test runner has
// no path to useAuthRecoveryExit.native.ts (see aliasLoader.mjs).
test('bare/Web useAuthRecoveryExit returns a callable function', () => {
  const exit = useAuthRecoveryExit(() => {});
  assert.equal(typeof exit, 'function');
});

test('bare/Web exit action is a safe no-op under Node (no window) and never calls closeRecoveryState', () => {
  // Product Decision A seam: Web's variant must not force any state
  // cleanup / sign-out through the closeRecoveryState path — its whole
  // mechanism is the page reload, which is why the persisted recovery
  // session survives and the user stays authenticated.
  let closeRecoveryStateCalled = false;
  const exit = useAuthRecoveryExit(() => {
    closeRecoveryStateCalled = true;
  });

  assert.doesNotThrow(() => exit());
  assert.equal(closeRecoveryStateCalled, false);
});

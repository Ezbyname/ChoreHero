import assert from 'node:assert/strict';
import test from 'node:test';
import { registerAutoRefreshLifecycle } from '@/lib/authAutoRefreshLifecycle';

// This exercises the bare/Web no-op variant only — the plain Node test
// runner has no path to authAutoRefreshLifecycle.native.ts (see
// aliasLoader.mjs). That file's real AppState wiring is verified by
// TypeScript/build validation and real native execution instead, not here;
// its own pure decision logic (authAutoRefreshDecision.ts) is unit tested
// directly and separately.
test('bare/Web lifecycle registration returns a callable no-op cleanup', () => {
  const cleanup = registerAutoRefreshLifecycle();
  assert.equal(typeof cleanup, 'function');
  assert.doesNotThrow(() => cleanup());
});

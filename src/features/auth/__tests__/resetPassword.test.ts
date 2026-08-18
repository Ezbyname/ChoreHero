import assert from 'node:assert/strict';
import test from 'node:test';
import { resetPassword } from '@/features/auth/resetPassword';

test('empty password is rejected by client-side validation', async () => {
  const result = await resetPassword('', '');
  assert.deepEqual(result, { ok: false, reason: 'invalid_input' });
});

test('empty confirmation is rejected by client-side validation', async () => {
  const result = await resetPassword('SomePassword', '');
  assert.deepEqual(result, { ok: false, reason: 'invalid_input' });
});

test('mismatched confirmation is rejected by client-side validation', async () => {
  const result = await resetPassword('SomePassword', 'SomethingElse');
  assert.deepEqual(result, { ok: false, reason: 'invalid_input' });
});

// No length/strength assertion — any non-empty, matching pair must reach
// the provider call. In this test environment Supabase is unconfigured
// (no real .env), so the wrapper added in Step 0 fails closed — this
// simultaneously proves the call was attempted (a different reason than
// invalid_input) and stands in for "provider rejects" here, since there
// is no real provider connection in this environment to reject against
// (see the note below this step for what is and isn't covered by this).
test('a non-empty matching password reaches the provider call, which is surfaced as failed here', async () => {
  const result = await resetPassword('SomePassword123', 'SomePassword123');
  assert.deepEqual(result, { ok: false, reason: 'failed' });
});

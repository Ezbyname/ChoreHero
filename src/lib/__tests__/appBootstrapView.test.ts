import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAppBootstrapView } from '@/lib/appBootstrapView';

const NONE: { type: 'none' } = { type: 'none' };
const RECOVERY: { type: 'recovery' } = { type: 'recovery' };
const ERROR: { type: 'error'; errorCode: string | undefined } = { type: 'error', errorCode: 'otp_expired' };
const OTHER: { type: 'other' } = { type: 'other' };

test('resolving native recovery always shows loading, regardless of the redirect result', () => {
  assert.deepEqual(resolveAppBootstrapView(true, RECOVERY, 'expired'), { view: 'loading' });
  assert.deepEqual(resolveAppBootstrapView(true, NONE, 'requestReset'), { view: 'loading' });
});

test('a recovery result shows the reset-password view', () => {
  assert.deepEqual(resolveAppBootstrapView(false, RECOVERY, 'expired'), { view: 'resetPassword' });
});

test('an error result in expired mode shows the recovery-expired view', () => {
  assert.deepEqual(resolveAppBootstrapView(false, ERROR, 'expired'), { view: 'recoveryExpired' });
});

// This is the N1.3 corrective-patch fix itself: "Request a new link" must
// always transition to the request-new-link view. The function signature
// has no session/auth-state parameter at all, so there is no way for this
// result to depend on whether a valid session happens to exist — proven by
// construction, not just by this assertion.
test('an error result in requestReset mode shows the request-new-link view — independent of any session state, because none is even passed in', () => {
  assert.deepEqual(resolveAppBootstrapView(false, ERROR, 'requestReset'), { view: 'requestNewLink' });
});

test('an other result shows the email-confirmed view', () => {
  assert.deepEqual(resolveAppBootstrapView(false, OTHER, 'expired'), { view: 'emailConfirmed' });
  assert.deepEqual(resolveAppBootstrapView(false, OTHER, 'requestReset'), { view: 'emailConfirmed' });
});

test('a none result falls through to normal boot, regardless of expiredRecoveryMode', () => {
  assert.deepEqual(resolveAppBootstrapView(false, NONE, 'expired'), { view: 'normalBoot' });
  assert.deepEqual(resolveAppBootstrapView(false, NONE, 'requestReset'), { view: 'normalBoot' });
});

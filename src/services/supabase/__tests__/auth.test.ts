import assert from 'node:assert/strict';
import test from 'node:test';
import { isRateLimitError } from '@/services/supabase/auth';

// Exact codes confirmed against the installed @supabase/auth-js's own
// ErrorCode union — not guessed. sendPasswordResetEmail()'s actual network
// call isn't exercised here (no Supabase credentials in this test
// environment, and this codebase doesn't mock the client anywhere) — this
// covers the one genuinely pure piece of the fix. The other half — that
// ForgotPasswordScreen no longer discards the returned error and shows a
// false success state — is a straightforward code change verified by
// TypeScript (the destructuring wouldn't typecheck against a stale return
// shape) and by real-device QA, consistent with this repo's existing
// convention of not unit-testing React component rendering.
test('isRateLimitError recognizes over_email_send_rate_limit', () => {
  assert.equal(isRateLimitError({ code: 'over_email_send_rate_limit' }), true);
});

test('isRateLimitError recognizes over_request_rate_limit', () => {
  assert.equal(isRateLimitError({ code: 'over_request_rate_limit' }), true);
});

test('isRateLimitError rejects other error codes', () => {
  assert.equal(isRateLimitError({ code: 'validation_failed' }), false);
  assert.equal(isRateLimitError({ code: undefined }), false);
});

test('isRateLimitError is false for null/undefined', () => {
  assert.equal(isRateLimitError(null), false);
  assert.equal(isRateLimitError(undefined), false);
});

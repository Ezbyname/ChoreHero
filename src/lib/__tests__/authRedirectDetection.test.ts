import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAuthRedirect } from '@/lib/authRedirectDetection';

test('no markers at all -> none', () => {
  assert.deepEqual(classifyAuthRedirect('', ''), { type: 'none' });
});

test('signup confirmation hash -> other', () => {
  assert.deepEqual(
    classifyAuthRedirect('#access_token=abc&type=signup', ''),
    { type: 'other' },
  );
});

test('invite hash -> other', () => {
  assert.deepEqual(classifyAuthRedirect('#type=invite', ''), { type: 'other' });
});

test('magiclink hash -> other', () => {
  assert.deepEqual(classifyAuthRedirect('#type=magiclink', ''), { type: 'other' });
});

test('PKCE code param with no type/error -> other', () => {
  assert.deepEqual(classifyAuthRedirect('', '?code=abc123'), { type: 'other' });
});

test('recovery hash -> recovery', () => {
  assert.deepEqual(classifyAuthRedirect('#access_token=abc&type=recovery', ''), {
    type: 'recovery',
  });
});

test('expired-link error hash -> error, with code captured', () => {
  assert.deepEqual(
    classifyAuthRedirect('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', ''),
    { type: 'error', errorCode: 'otp_expired' },
  );
});

test('error hash with no error_code -> error, errorCode undefined', () => {
  assert.deepEqual(classifyAuthRedirect('#error=access_denied', ''), {
    type: 'error',
    errorCode: undefined,
  });
});

test('error takes priority over a recovery type on the same URL', () => {
  // Supabase never actually sends both at once, but the classifier must
  // still have a defined, tested priority rather than an accidental one.
  assert.deepEqual(
    classifyAuthRedirect('#type=recovery&error=access_denied&error_code=otp_expired', ''),
    { type: 'error', errorCode: 'otp_expired' },
  );
});

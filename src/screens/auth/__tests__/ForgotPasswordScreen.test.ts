import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInitialEmail } from '@/lib/resolveInitialEmail';

// A1 — Recovery Email Prefill. This is the one piece of actual logic A1
// introduces; the component itself has no render-test infrastructure
// (matching the rest of this repo's convention — verified by TypeScript
// and build/device QA instead).
test('initialEmail present -> resolved value uses it', () => {
  assert.equal(resolveInitialEmail('parent@example.com'), 'parent@example.com');
});

test('initialEmail absent -> resolved value is empty', () => {
  assert.equal(resolveInitialEmail(undefined), '');
  assert.equal(resolveInitialEmail(), '');
});

// No identity-binding behavior: the resolver is a plain passthrough of
// whatever string it's given — it has no access to (and cannot derive
// anything from) a recovery URL, token, or any other source. There is
// nothing here to lock or infer from.
test('resolved value is exactly the input, nothing derived or transformed', () => {
  assert.equal(resolveInitialEmail('Weird+Case@Example.COM'), 'Weird+Case@Example.COM');
});

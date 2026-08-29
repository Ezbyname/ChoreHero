import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAccountType } from '@/lib/formatAccountType';

// QA-01.2 — locked mapping: child->Child, adult->Adult, admin->Admin,
// owner->Owner. Purely presentational — no permission logic here.

test('child -> Child', () => {
  assert.equal(formatAccountType('child'), 'Child');
});

test('adult -> Adult', () => {
  assert.equal(formatAccountType('adult'), 'Adult');
});

test('admin -> Admin', () => {
  assert.equal(formatAccountType('admin'), 'Admin');
});

test('owner -> Owner', () => {
  assert.equal(formatAccountType('owner'), 'Owner');
});

test('unresolvable role (null) does not invent a label', () => {
  assert.equal(formatAccountType(null), null);
});

test('an unrecognized role string does not invent a label', () => {
  assert.equal(formatAccountType('something-unexpected'), null);
});

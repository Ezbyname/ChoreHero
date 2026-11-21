import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_CLAIM_FORM_PHASE,
  canSubmitClaim,
  deriveClaimFormView,
  onClaimSubmitResult,
  onClaimSubmitStarted,
  onClaimSubmitThrew,
  onClaimTitleEdited,
} from '@/features/contributions/claimContributionFormState';

test('initial: form view, no error, submit needs non-blank text', () => {
  assert.deepEqual(deriveClaimFormView(INITIAL_CLAIM_FORM_PHASE, null), { kind: 'form', submitting: false, error: null });
  assert.equal(canSubmitClaim(INITIAL_CLAIM_FORM_PHASE, '   '), false);
  assert.equal(canSubmitClaim(INITIAL_CLAIM_FORM_PHASE, 'Fed the cat'), true);
});

test('while submitting: spinner state, repeated taps refused, no success shown yet', () => {
  const phase = onClaimSubmitStarted();
  assert.equal(canSubmitClaim(phase, 'Fed the cat'), false);
  assert.deepEqual(deriveClaimFormView(phase, null), { kind: 'form', submitting: true, error: null });
});

test('confirmed success -> visible "sent" confirmation with the claim title', () => {
  const phase = onClaimSubmitResult({ ok: true }, '  Fed the cat ');
  assert.deepEqual(deriveClaimFormView(phase, null), { kind: 'sent', title: 'Fed the cat' });
  assert.equal(canSubmitClaim(phase, 'another'), false);
});

test('success survives the store refresh that adds the pending row (re-render does not erase it)', () => {
  const phase = onClaimSubmitResult({ ok: true }, 'Fed the cat');
  // claimContribution refreshes the store before resolving, so the very
  // next render already sees the pending claim.
  assert.equal(deriveClaimFormView(phase, 'Fed the cat').kind, 'sent');
});

test('after a remount (local phase lost) the pending claim from the store still shows as waiting', () => {
  assert.deepEqual(deriveClaimFormView(INITIAL_CLAIM_FORM_PHASE, 'Fed the cat'), { kind: 'waiting', title: 'Fed the cat' });
});

test('failure never shows success and keeps the form retryable', () => {
  const phase = onClaimSubmitResult({ ok: false, reason: 'failed' }, 'Fed the cat');
  assert.deepEqual(deriveClaimFormView(phase, null), { kind: 'form', submitting: false, error: 'failed' });
  assert.equal(canSubmitClaim(phase, 'Fed the cat'), true);
});

test('not_authorized / invalid_input collapse to the generic visible error', () => {
  for (const reason of ['not_authorized', 'invalid_input'] as const) {
    const view = deriveClaimFormView(onClaimSubmitResult({ ok: false, reason }, 'x'), null);
    assert.deepEqual(view, { kind: 'form', submitting: false, error: 'failed' });
  }
});

test('duplicate_pending -> its own message while no pending row is loaded yet', () => {
  const phase = onClaimSubmitResult({ ok: false, reason: 'duplicate_pending' }, 'x');
  assert.deepEqual(deriveClaimFormView(phase, null), { kind: 'form', submitting: false, error: 'duplicate_pending' });
});

test('a thrown claimContribution lands in a visible retryable failure, not a stuck spinner', () => {
  const view = deriveClaimFormView(onClaimSubmitThrew(), null);
  assert.deepEqual(view, { kind: 'form', submitting: false, error: 'failed' });
});

test('editing the text after a failure clears the stale error; editing otherwise changes nothing', () => {
  const failed = onClaimSubmitResult({ ok: false, reason: 'failed' }, 'x');
  assert.deepEqual(onClaimTitleEdited(failed), INITIAL_CLAIM_FORM_PHASE);
  const submitting = onClaimSubmitStarted();
  assert.equal(onClaimTitleEdited(submitting), submitting);
});

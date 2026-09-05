import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createConfirmGuard,
  resolveReviewConfirmation,
  type ReviewMutations,
} from '@/features/rewards/rewardReviewConfirmationUx';

function spyMutations(overrides: {
  approveResult?: { ok: true } | { ok: false; reason: string };
  rejectResult?:  { ok: true } | { ok: false; reason: string };
} = {}): ReviewMutations & { approveCalls: number; rejectCalls: number } {
  const state = {
    approveCalls: 0,
    rejectCalls:  0,
    async approve() {
      state.approveCalls += 1;
      return overrides.approveResult ?? { ok: true as const };
    },
    async reject() {
      state.rejectCalls += 1;
      return overrides.rejectResult ?? { ok: true as const };
    },
  };
  return state;
}

// ── APPROVE ──────────────────────────────────────────────────────────────

test('approve: not confirmed yet -> approve mutation is never called', async () => {
  const mutations = spyMutations();
  await resolveReviewConfirmation('approve', false, mutations);
  assert.equal(mutations.approveCalls, 0);
  assert.equal(mutations.rejectCalls, 0);
});

test('approve: cancel produces CANCELLED, no mutation of either kind', async () => {
  const mutations = spyMutations();
  const outcome = await resolveReviewConfirmation('approve', false, mutations);
  assert.deepEqual(outcome, { kind: 'CANCELLED' });
  assert.equal(mutations.approveCalls, 0);
  assert.equal(mutations.rejectCalls, 0);
});

test('approve: confirm calls approve exactly once, never reject', async () => {
  const mutations = spyMutations();
  await resolveReviewConfirmation('approve', true, mutations);
  assert.equal(mutations.approveCalls, 1);
  assert.equal(mutations.rejectCalls, 0);
});

test('approve: successful mutation resolves APPROVED', async () => {
  const mutations = spyMutations();
  const outcome = await resolveReviewConfirmation('approve', true, mutations);
  assert.deepEqual(outcome, { kind: 'APPROVED' });
});

test('approve: mutation failure resolves FAILED, not CANCELLED', async () => {
  const mutations = spyMutations({ approveResult: { ok: false, reason: 'insufficient_balance' } });
  const outcome = await resolveReviewConfirmation('approve', true, mutations);
  assert.deepEqual(outcome, { kind: 'FAILED', reason: 'insufficient_balance' });
  assert.notEqual(outcome.kind, 'CANCELLED');
});

// ── REJECT ───────────────────────────────────────────────────────────────

test('reject: not confirmed yet -> reject mutation is never called', async () => {
  const mutations = spyMutations();
  await resolveReviewConfirmation('reject', false, mutations);
  assert.equal(mutations.rejectCalls, 0);
  assert.equal(mutations.approveCalls, 0);
});

test('reject: cancel produces CANCELLED, no mutation of either kind', async () => {
  const mutations = spyMutations();
  const outcome = await resolveReviewConfirmation('reject', false, mutations);
  assert.deepEqual(outcome, { kind: 'CANCELLED' });
  assert.equal(mutations.rejectCalls, 0);
  assert.equal(mutations.approveCalls, 0);
});

test('reject: confirm calls reject exactly once, never approve', async () => {
  const mutations = spyMutations();
  await resolveReviewConfirmation('reject', true, mutations);
  assert.equal(mutations.rejectCalls, 1);
  assert.equal(mutations.approveCalls, 0);
});

test('reject: successful mutation resolves REJECTED', async () => {
  const mutations = spyMutations();
  const outcome = await resolveReviewConfirmation('reject', true, mutations);
  assert.deepEqual(outcome, { kind: 'REJECTED' });
});

test('reject: mutation failure resolves FAILED, not CANCELLED', async () => {
  const mutations = spyMutations({ rejectResult: { ok: false, reason: 'not_pending' } });
  const outcome = await resolveReviewConfirmation('reject', true, mutations);
  assert.deepEqual(outcome, { kind: 'FAILED', reason: 'not_pending' });
  assert.notEqual(outcome.kind, 'CANCELLED');
});

// ── DUPLICATION (createConfirmGuard) ────────────────────────────────────

test('guard: two confirm calls fired back-to-back invoke the mutation exactly once and share one outcome', async () => {
  const mutations = spyMutations();
  const guard = createConfirmGuard();

  // Deliberately not awaited between calls — simulates a double-tap
  // before the first attempt's promise has settled.
  const first  = guard('approve', mutations);
  const second = guard('approve', mutations);

  const [firstOutcome, secondOutcome] = await Promise.all([first, second]);

  assert.equal(mutations.approveCalls, 1);
  assert.deepEqual(firstOutcome, { kind: 'APPROVED' });
  assert.deepEqual(secondOutcome, { kind: 'APPROVED' });
});

test('guard: a new confirm after the previous one settles starts a fresh attempt', async () => {
  const mutations = spyMutations();
  const guard = createConfirmGuard();

  await guard('approve', mutations);
  await guard('approve', mutations);

  assert.equal(mutations.approveCalls, 2);
});

test('guard: does not cross-contaminate approve and reject call counts', async () => {
  const mutations = spyMutations();
  const guard = createConfirmGuard();

  const first  = guard('approve', mutations);
  const second = guard('reject', mutations);

  await Promise.all([first, second]);

  // The guard was already occupied by the first call, so the second call
  // is deduped onto the SAME in-flight attempt (approve) rather than
  // starting a concurrent reject — reject must never have been called.
  assert.equal(mutations.approveCalls, 1);
  assert.equal(mutations.rejectCalls, 0);
});

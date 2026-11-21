import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_PENDING_STATE,
  availablePendingActions,
  isBusy,
  onBeginWithdraw,
  onChooseIntent,
  onKeepPending,
  onPendingLoadResult,
  onPendingLoaded,
  onWithdrawResult,
} from '@/features/tasks/components/pendingCompletionUiState';

const NO_PHOTO   = { submissionId: 's1', hasPhoto: false };
const WITH_PHOTO = { submissionId: 's1', hasPhoto: true };

test('no-photo pending -> Add photo + Cancel completion', () => {
  assert.deepEqual(availablePendingActions(NO_PHOTO), ['add_photo', 'cancel']);
});

test('photo pending -> Change photo + Cancel completion', () => {
  assert.deepEqual(availablePendingActions(WITH_PHOTO), ['change_photo', 'cancel']);
});

test('opens in loading; load result maps to ready / gone / load_failed', () => {
  assert.equal(INITIAL_PENDING_STATE.phase, 'loading');
  assert.equal(isBusy(INITIAL_PENDING_STATE), true);
  assert.deepEqual(onPendingLoaded(NO_PHOTO), { phase: 'ready', pending: NO_PHOTO, error: null });
  assert.deepEqual(onPendingLoadResult('not_found'), { phase: 'gone' });
  assert.deepEqual(onPendingLoadResult('failed'), { phase: 'load_failed' });
  assert.deepEqual(onPendingLoadResult('not_authorized'), { phase: 'load_failed' });
});

test('an action asks for confirmation first; "Keep it" goes back with nothing sent', () => {
  const ready = onPendingLoaded(NO_PHOTO);
  const confirming = onChooseIntent(ready, 'cancel');
  assert.equal(confirming.phase, 'confirming');
  assert.deepEqual(onKeepPending(confirming), ready);
});

test('an action that does not fit the submission is ignored (no Change photo when there is no photo)', () => {
  const ready = onPendingLoaded(NO_PHOTO);
  assert.equal(onChooseIntent(ready, 'change_photo'), ready);
  assert.equal(onChooseIntent(onPendingLoaded(WITH_PHOTO), 'add_photo').phase, 'ready');
});

test('withdraw can only start from confirming (double tap / stray tap sends nothing)', () => {
  const ready = onPendingLoaded(NO_PHOTO);
  assert.equal(onBeginWithdraw(ready), null);
  const withdrawing = onBeginWithdraw(onChooseIntent(ready, 'cancel'))!;
  assert.equal(withdrawing.phase, 'withdrawing');
  assert.equal(isBusy(withdrawing), true);
  assert.equal(onBeginWithdraw(withdrawing), null);
});

test('cancel success -> visible "cancelled" confirmation', () => {
  const w = onBeginWithdraw(onChooseIntent(onPendingLoaded(NO_PHOTO), 'cancel'))!;
  assert.deepEqual(onWithdrawResult(w, { ok: true }), { phase: 'cancelled' });
});

test('add/change photo success -> hand over to the completion Modal', () => {
  const add = onBeginWithdraw(onChooseIntent(onPendingLoaded(NO_PHOTO), 'add_photo'))!;
  assert.deepEqual(onWithdrawResult(add, { ok: true }), { phase: 'reopen_for_photo' });
  const change = onBeginWithdraw(onChooseIntent(onPendingLoaded(WITH_PHOTO), 'change_photo'))!;
  assert.deepEqual(onWithdrawResult(change, { ok: true }), { phase: 'reopen_for_photo' });
});

test('cancel failure -> still pending with a visible error, actions available again', () => {
  const w = onBeginWithdraw(onChooseIntent(onPendingLoaded(WITH_PHOTO), 'cancel'))!;
  const failed = onWithdrawResult(w, { ok: false, reason: 'failed' });
  assert.deepEqual(failed, { phase: 'ready', pending: WITH_PHOTO, error: 'action_failed' });
  assert.equal(onChooseIntent(failed, 'cancel').phase, 'confirming');
  assert.deepEqual(onWithdrawResult(w, { ok: false, reason: 'not_authorized' }), failed);
});

test('reviewed in the meantime (CH017) -> "gone", not an error loop', () => {
  const w = onBeginWithdraw(onChooseIntent(onPendingLoaded(NO_PHOTO), 'cancel'))!;
  assert.deepEqual(onWithdrawResult(w, { ok: false, reason: 'not_pending' }), { phase: 'gone' });
});

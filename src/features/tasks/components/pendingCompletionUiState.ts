// Pure state for the child's "waiting for review" sheet
// (PendingCompletionModal.tsx). No React / react-native — Node-test safe.
//
// Every action is withdraw-based. Success is only ever shown after the
// server confirmed the withdrawal; a failure keeps the submission shown as
// still pending (which it is) with a visible error.

import type { ChildPendingCompletion } from '@/features/tasks/childPendingCompletion';

export type PendingIntent = 'cancel' | 'add_photo' | 'change_photo';

export type PendingCompletionUiState =
  | { phase: 'loading' }
  | { phase: 'load_failed' }
  | { phase: 'gone' }                                  // no longer pending (reviewed / already withdrawn)
  | { phase: 'ready';       pending: ChildPendingCompletion; error: 'action_failed' | null }
  | { phase: 'confirming';  pending: ChildPendingCompletion; intent: PendingIntent }
  | { phase: 'withdrawing'; pending: ChildPendingCompletion; intent: PendingIntent }
  | { phase: 'cancelled' }                             // terminal success for 'cancel'
  | { phase: 'reopen_for_photo' };                     // terminal success for add/change photo

export const INITIAL_PENDING_STATE: PendingCompletionUiState = { phase: 'loading' };

// The two actions a waiting card offers, by whether evidence was attached.
export function availablePendingActions(pending: ChildPendingCompletion): PendingIntent[] {
  return pending.hasPhoto ? ['change_photo', 'cancel'] : ['add_photo', 'cancel'];
}

export function onPendingLoaded(pending: ChildPendingCompletion): PendingCompletionUiState {
  return { phase: 'ready', pending, error: null };
}

export function onPendingLoadResult(reason: 'not_found' | 'not_authorized' | 'failed'): PendingCompletionUiState {
  return reason === 'not_found' ? { phase: 'gone' } : { phase: 'load_failed' };
}

export function onChooseIntent(state: PendingCompletionUiState, intent: PendingIntent): PendingCompletionUiState {
  if (state.phase !== 'ready') return state;
  if (!availablePendingActions(state.pending).includes(intent)) return state;
  return { phase: 'confirming', pending: state.pending, intent };
}

export function onKeepPending(state: PendingCompletionUiState): PendingCompletionUiState {
  if (state.phase !== 'confirming') return state;
  return { phase: 'ready', pending: state.pending, error: null };
}

// Returns null when a withdraw must not start (not confirming) — the caller
// then sends nothing. This is also the double-tap guard at the state level.
export function onBeginWithdraw(state: PendingCompletionUiState): PendingCompletionUiState | null {
  if (state.phase !== 'confirming') return null;
  return { phase: 'withdrawing', pending: state.pending, intent: state.intent };
}

export function onWithdrawResult(
  state:  PendingCompletionUiState,
  result: { ok: true } | { ok: false; reason: 'not_pending' | 'not_authorized' | 'failed' },
): PendingCompletionUiState {
  if (state.phase !== 'withdrawing') return state;
  if (result.ok) return state.intent === 'cancel' ? { phase: 'cancelled' } : { phase: 'reopen_for_photo' };
  // Reviewed in the meantime: nothing left to withdraw.
  if (result.reason === 'not_pending') return { phase: 'gone' };
  // Still pending on the server: say so, keep the actions available.
  return { phase: 'ready', pending: state.pending, error: 'action_failed' };
}

export function isBusy(state: PendingCompletionUiState): boolean {
  return state.phase === 'loading' || state.phase === 'withdrawing';
}

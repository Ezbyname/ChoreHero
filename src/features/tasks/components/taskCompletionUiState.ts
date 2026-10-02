// Pure state module for the child Task Completion V2 Modal. No React, no
// expo-* imports, no react-native imports — this file must stay node-test
// safe. The Modal (TaskCompletionModal.tsx) owns the native-only pieces
// (expo-image-picker, expo-crypto, RN primitives) and calls these pure
// transitions.
//
// Lazy attempt creation is the central invariant: opening the modal,
// opening a picker, denying a camera permission, or cancelling a picker
// must NEVER mint a TaskCompletionAttemptState. Attempts are only minted:
//   - on successful photo selection (fresh photo-bearing attempt)
//   - at submit-time when the user has no photo and no attempt yet
//     (fresh no-photo attempt)
//   - on photo replace (fresh photo-bearing attempt)
//   - on photo remove (fresh no-photo attempt)
// An ordinary network retry (uncertain / retryable failed) does NOT mint
// a new attempt — the state returned by the previous orchestration call
// is reused verbatim, preserving clientRequestId, photoObjectId, and the
// canonical path.

import {
  onPhotoChanged,
  startNewAttempt,
  type TaskCompletionAttemptState,
} from '@/features/tasks/taskCompletionAttempt';

export type SelectedPhoto = {
  previewUri: string;
  mimeType:   string;
};

export type UiPhase =
  | 'idle'
  | 'photo_selected'
  | 'submitting'
  | 'retryable_uncertain'
  | 'retryable_failed'
  | 'validation_error';

export type UiErrorKind =
  | 'invalid_mime'
  | 'network_uncertain'
  | 'retryable_failed'
  | 'unexpected_failure'
  | 'picker_failed'
  | 'photo_read_failed'
  | 'not_open'
  | 'not_authorized'
  | 'camera_permission_denied';

export type TaskCompletionUiState = {
  photo:   SelectedPhoto | null;
  attempt: TaskCompletionAttemptState;
  phase:   UiPhase;
  error:   { kind: UiErrorKind } | null;
};

export const INITIAL_UI_STATE: TaskCompletionUiState = {
  photo:   null,
  attempt: null,
  phase:   'idle',
  error:   null,
};

// User picked / captured a photo. Replace or first-selection are both
// NEW logical attempts — mint fresh clientRequestId + fresh photoObjectId.
export function onPhotoSelected(
  _state:     TaskCompletionUiState,
  photo:      SelectedPhoto,
  generateId: () => string,
): TaskCompletionUiState {
  return {
    photo,
    attempt: onPhotoChanged(true, generateId),
    phase:   'photo_selected',
    error:   null,
  };
}

// User explicitly removed the selected photo. NEW no-photo attempt —
// fresh clientRequestId, photoObjectId = null.
export function onPhotoRemoved(
  _state:     TaskCompletionUiState,
  generateId: () => string,
): TaskCompletionUiState {
  return {
    photo:   null,
    attempt: onPhotoChanged(false, generateId),
    phase:   'idle',
    error:   null,
  };
}

// Picker was cancelled / returned no asset. Attempt and photo state are
// preserved unchanged.
export function onPickerCancelled(state: TaskCompletionUiState): TaskCompletionUiState {
  return state;
}

// Camera permission was denied. No attempt is created. The caller clears
// the error on the next successful interaction.
export function onCameraPermissionDenied(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, error: { kind: 'camera_permission_denied' } };
}

// Pre-network validation failure (missing / unsupported MIME).
export function onSubmitInvalidMime(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, phase: 'validation_error', error: { kind: 'invalid_mime' } };
}

// Submit pressed with a photo already selected. The photo-bearing attempt
// was minted at selection time; we do NOT mint a new one here — this is
// where retry-identity is preserved. Returns `null` if the invariant
// (photo != null => attempt != null) is violated (unreachable in practice
// but defensively surfaced).
export function onBeginPhotoSubmit(state: TaskCompletionUiState): TaskCompletionUiState | null {
  if (!state.photo || !state.attempt || state.attempt.photoObjectId === null) return null;
  return { ...state, phase: 'submitting', error: null };
}

// Submit pressed with no photo. If no attempt exists yet (user opened the
// modal and pressed Submit immediately), mint a fresh no-photo attempt
// lazily. If a no-photo attempt already exists (e.g. after Remove), reuse
// it verbatim.
export function onBeginNoPhotoSubmit(
  state:      TaskCompletionUiState,
  generateId: () => string,
): TaskCompletionUiState {
  if (state.photo !== null) return state; // caller error; preserved
  if (state.attempt && state.attempt.photoObjectId === null) {
    return { ...state, phase: 'submitting', error: null };
  }
  return {
    ...state,
    attempt: startNewAttempt(false, generateId),
    phase:   'submitting',
    error:   null,
  };
}

// Submission returned `reason: 'uncertain'` — preserve the returned state
// verbatim (ids intact, evidenceUploadState now 'uncertain') so the next
// retry re-uses the SAME canonical path and SAME ids.
export function onSubmitUncertain(
  state:          TaskCompletionUiState,
  returnedState:  TaskCompletionAttemptState,
): TaskCompletionUiState {
  return {
    ...state,
    attempt: returnedState,
    phase:   'retryable_uncertain',
    error:   { kind: 'network_uncertain' },
  };
}

// Submission returned `reason: 'failed'` — preserve the returned state.
export function onSubmitRetryableFailed(
  state:          TaskCompletionUiState,
  returnedState:  TaskCompletionAttemptState,
): TaskCompletionUiState {
  return {
    ...state,
    attempt: returnedState,
    phase:   'retryable_failed',
    error:   { kind: 'retryable_failed' },
  };
}

// Terminal server-side rejection — same IDs cannot succeed.
export function onSubmitTerminalNotOpen(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, attempt: null, phase: 'validation_error', error: { kind: 'not_open' } };
}

export function onSubmitTerminalNotAuthorized(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, attempt: null, phase: 'validation_error', error: { kind: 'not_authorized' } };
}

// Success — reset to the initial state. Caller closes the modal.
export function onSubmitSuccess(_state: TaskCompletionUiState): TaskCompletionUiState {
  return INITIAL_UI_STATE;
}

// Unexpected exception during submission (fetch/blob/arrayBuffer/orchestration
// threw instead of returning a result). Must NOT leave the Modal stuck in
// 'submitting'. Preserves photo, attempt, clientRequestId, and photoObjectId
// so the child can retry without a new logical attempt being minted.
export function onSubmitUnexpectedFailure(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, phase: 'retryable_failed', error: { kind: 'unexpected_failure' } };
}

// Local photo-read failed (fetch(previewUri) / blob() / arrayBuffer() threw
// before any network call to Storage/Edge). Attempt + selected photo
// preserved; child can retry, replace, or remove.
export function onLocalPhotoReadFailed(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, phase: 'retryable_failed', error: { kind: 'photo_read_failed' } };
}

// Picker call itself threw (not canceled, not permission denied — a genuine
// exception). Preserves existing photo + attempt verbatim; a child who was
// REPLACING an existing photo keeps the original one. No new attempt is
// ever minted here.
export function onPickerFailed(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, error: { kind: 'picker_failed' } };
}

// Pure helper: true when the orchestration returned a terminal rejection
// (not_open / not_authorized). Caller disables all picker/submit controls;
// Cancel/Close stays enabled.
export function isTerminalPhase(state: TaskCompletionUiState): boolean {
  return state.phase === 'validation_error' &&
         (state.error?.kind === 'not_open' || state.error?.kind === 'not_authorized');
}

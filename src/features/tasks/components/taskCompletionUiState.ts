// Pure state module for the child Task Completion Modal. No React, no
// expo-* imports, no react-native imports — this file must stay node-test
// safe. The Modal (TaskCompletionModal.tsx) owns the native-only pieces
// (expo-image-picker, expo-crypto, RN primitives) and calls these pure
// transitions.
//
// The child may attach 0..MAX_EVIDENCE_PHOTOS photos (Camera and Gallery
// mixed freely). The photo set is the payload of ONE logical attempt
// (CompletionAttempt: one clientRequestId + one photoObjectId per photo).
//
// Lazy attempt creation is the central invariant: opening the modal,
// opening a picker, denying a camera permission, or cancelling a picker
// must NEVER mint an attempt. Attempts are only minted:
//   - when the photo set changes (add / replace / remove a photo): a fresh
//     attempt for the WHOLE new set — never an edit of the old one;
//   - at submit-time when the child has no photo and no attempt yet.
// An ordinary network retry (uncertain / retryable failed) does NOT mint a
// new attempt — the attempt returned by the previous orchestration call is
// reused verbatim, preserving clientRequestId, every photoObjectId and
// therefore every canonical path.

import {
  MAX_EVIDENCE_PHOTOS,
  startCompletionAttempt,
  type CompletionAttempt,
  type SubmitProgress,
} from '@/features/tasks/requestTaskCompletionWithPhotos';

export { MAX_EVIDENCE_PHOTOS };

export type PhotoSource = 'camera' | 'gallery';

export type SelectedPhoto = {
  previewUri: string;
  mimeType:   string;
  source:     PhotoSource;
};

export type UiPhase =
  | 'idle'
  | 'ready'
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
  | 'camera_permission_denied'
  | 'attempt_rejected'
  | 'too_many_photos';

export type TaskCompletionUiState = {
  photos:   readonly SelectedPhoto[];
  attempt:  CompletionAttempt | null;
  phase:    UiPhase;
  error:    { kind: UiErrorKind } | null;
  // Shown inline while submitting ("Uploading photo 2 of 3…"). Never a
  // navigation / global loading screen.
  progress: SubmitProgress | null;
};

export const INITIAL_UI_STATE: TaskCompletionUiState = {
  photos:   [],
  attempt:  null,
  phase:    'idle',
  error:    null,
  progress: null,
};

function withNewSet(
  state:      TaskCompletionUiState,
  photos:     readonly SelectedPhoto[],
  generateId: () => string,
  error:      { kind: UiErrorKind } | null = null,
): TaskCompletionUiState {
  return {
    ...state,
    photos,
    attempt:  startCompletionAttempt(photos.length, generateId),
    phase:    photos.length > 0 ? 'ready' : 'idle',
    error,
    progress: null,
  };
}

export function remainingPhotoSlots(state: TaskCompletionUiState): number {
  return Math.max(0, MAX_EVIDENCE_PHOTOS - state.photos.length);
}

export function canAddPhotos(state: TaskCompletionUiState): boolean {
  return state.phase !== 'submitting' && !isTerminalPhase(state) && remainingPhotoSlots(state) > 0;
}

// Camera / Gallery returned one or more photos. They are appended up to the
// limit; anything beyond it is dropped and reported (never silently). An
// empty list (picker cancelled) changes nothing.
export function onPhotosAdded(
  state:      TaskCompletionUiState,
  added:      readonly SelectedPhoto[],
  generateId: () => string,
): TaskCompletionUiState {
  if (added.length === 0) return state;
  const room = remainingPhotoSlots(state);
  if (room === 0) return { ...state, error: { kind: 'too_many_photos' } };
  const accepted = added.slice(0, room);
  return withNewSet(
    state,
    [...state.photos, ...accepted],
    generateId,
    accepted.length < added.length ? { kind: 'too_many_photos' } : null,
  );
}

export function onPhotoReplacedAt(
  state:      TaskCompletionUiState,
  index:      number,
  photo:      SelectedPhoto,
  generateId: () => string,
): TaskCompletionUiState {
  if (index < 0 || index >= state.photos.length) return state;
  return withNewSet(state, state.photos.map((p, i) => (i === index ? photo : p)), generateId);
}

// Removing the last photo leaves a fresh no-photo attempt, exactly like the
// old single-photo Remove.
export function onPhotoRemovedAt(
  state:      TaskCompletionUiState,
  index:      number,
  generateId: () => string,
): TaskCompletionUiState {
  if (index < 0 || index >= state.photos.length) return state;
  return withNewSet(state, state.photos.filter((_, i) => i !== index), generateId);
}

// Picker was cancelled / returned no asset. Nothing changes.
export function onPickerCancelled(state: TaskCompletionUiState): TaskCompletionUiState {
  return state;
}

// Camera permission was denied. No attempt is created.
export function onCameraPermissionDenied(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, error: { kind: 'camera_permission_denied' } };
}

// The picker call itself threw. Existing photos + attempt are preserved
// verbatim; no ids are minted.
export function onPickerFailed(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, error: { kind: 'picker_failed' } };
}

// A picked file's MIME type is not allowed (or the server said so). The
// selection itself is unchanged.
export function onSubmitInvalidMime(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, phase: 'validation_error', error: { kind: 'invalid_mime' }, progress: null };
}

// Submit is only meaningful when it can reach the orchestration call: with
// photos, the attempt minted for exactly this set must exist; without
// photos, beginSubmit mints one lazily.
export function canSubmit(state: TaskCompletionUiState): boolean {
  if (state.phase === 'submitting' || isTerminalPhase(state)) return false;
  if (state.photos.length > MAX_EVIDENCE_PHOTOS) return false;
  if (state.photos.length > 0) {
    return state.attempt !== null && state.attempt.photos.length === state.photos.length;
  }
  return true;
}

// Submit pressed. Reuses the existing attempt (retry identity); mints a
// no-photo attempt only when there are no photos and no attempt yet.
// Returns the state to render immediately; phase === 'submitting' means
// the caller goes on to finishCompletionSubmit.
export function onBeginSubmit(
  state:      TaskCompletionUiState,
  generateId: () => string,
): TaskCompletionUiState {
  if (!canSubmit(state)) {
    return state.photos.length > 0 && !isTerminalPhase(state) && state.phase !== 'submitting'
      ? onSubmitAttemptUnavailable(state)
      : state;
  }
  const attempt = state.attempt ?? startCompletionAttempt(0, generateId);
  return { ...state, attempt, phase: 'submitting', error: null, progress: null };
}

export function onSubmitProgress(state: TaskCompletionUiState, progress: SubmitProgress): TaskCompletionUiState {
  if (state.phase !== 'submitting') return state;
  return { ...state, progress };
}

// 'uncertain' — keep the returned attempt verbatim (same ids, per-photo
// upload states) so the retry re-uses the SAME canonical paths.
export function onSubmitUncertain(
  state:          TaskCompletionUiState,
  returnedAttempt: CompletionAttempt | null,
): TaskCompletionUiState {
  if (returnedAttempt === null) return onSubmitAttemptUnavailable(state);
  return { ...state, attempt: returnedAttempt, phase: 'retryable_uncertain', error: { kind: 'network_uncertain' }, progress: null };
}

// 'failed' — a null attempt means the server refused this logical attempt
// for good (CH014 / CH018 / CH019 / CH021); not an ordinary retry.
export function onSubmitRetryableFailed(
  state:           TaskCompletionUiState,
  returnedAttempt: CompletionAttempt | null,
): TaskCompletionUiState {
  if (returnedAttempt === null) return onSubmitAttemptUnavailable(state);
  return { ...state, attempt: returnedAttempt, phase: 'retryable_failed', error: { kind: 'retryable_failed' }, progress: null };
}

export function onSubmitTerminalNotOpen(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, attempt: null, phase: 'validation_error', error: { kind: 'not_open' }, progress: null };
}

export function onSubmitTerminalNotAuthorized(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, attempt: null, phase: 'validation_error', error: { kind: 'not_authorized' }, progress: null };
}

// The current selection has no usable attempt. No ids are minted here: the
// child recovers by adding / replacing / removing a photo, each of which
// starts a NEW attempt. Photos stay visible.
export function onSubmitAttemptUnavailable(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, attempt: null, phase: 'validation_error', error: { kind: 'attempt_rejected' }, progress: null };
}

// Success — reset. The caller closes the modal.
export function onSubmitSuccess(_state: TaskCompletionUiState): TaskCompletionUiState {
  return INITIAL_UI_STATE;
}

// The orchestration threw instead of returning a result. Never leaves the
// modal stuck in 'submitting'; photos + attempt + ids preserved.
export function onSubmitUnexpectedFailure(state: TaskCompletionUiState): TaskCompletionUiState {
  return { ...state, phase: 'retryable_failed', error: { kind: 'unexpected_failure' }, progress: null };
}

// A selected photo could not be read from the device before upload.
// Retryable; replace / remove are also available.
export function onLocalPhotoReadFailed(
  state:           TaskCompletionUiState,
  returnedAttempt: CompletionAttempt | null = state.attempt,
): TaskCompletionUiState {
  return { ...state, attempt: returnedAttempt, phase: 'retryable_failed', error: { kind: 'photo_read_failed' }, progress: null };
}

// Terminal server rejection (not_open / not_authorized): only Close remains.
export function isTerminalPhase(state: TaskCompletionUiState): boolean {
  return state.phase === 'validation_error' &&
         (state.error?.kind === 'not_open' || state.error?.kind === 'not_authorized');
}

// "3 / 5" — always rendered next to the thumbnails.
export function photoCountLabel(state: TaskCompletionUiState): string {
  return `${state.photos.length} / ${MAX_EVIDENCE_PHOTOS}`;
}

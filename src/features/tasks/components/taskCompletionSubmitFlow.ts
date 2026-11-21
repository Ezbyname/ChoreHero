// The child completion Modal's submit sequence, extracted so it can be
// exercised under Node with injected dependencies. No React, no expo-*,
// no react-native imports. TaskCompletionModal.tsx calls
// beginCompletionSubmit (sync, renders the inline progress state) and then
// finishCompletionSubmit (async: per photo read -> upload, then the RPC).
//
// The whole sequence stays inside the sheet: progress is reported through
// onProgress ("Uploading photo 2 of 3…"); nothing here navigates or touches
// app-wide loading state.

import {
  materializeEvidencePhoto,
  type MaterializeEvidencePhotoResult,
} from '@/features/tasks/materializeEvidencePhoto';
import type { TaskCompletionTaskRef } from '@/features/tasks/requestTaskCompletionWithEvidence';
import {
  submitTaskCompletionWithPhotos,
  type CompletionAttempt,
  type PhotoLoader,
  type SubmitProgress,
  type SubmitWithPhotosDeps,
  type SubmitWithPhotosResult,
} from '@/features/tasks/requestTaskCompletionWithPhotos';
import type { TaskCompletionSubmissionRow } from '@/types/supabase';
import {
  onBeginSubmit,
  onLocalPhotoReadFailed,
  onSubmitInvalidMime,
  onSubmitRetryableFailed,
  onSubmitSuccess,
  onSubmitTerminalNotAuthorized,
  onSubmitTerminalNotOpen,
  onSubmitUncertain,
  onSubmitUnexpectedFailure,
  type TaskCompletionUiState,
} from '@/features/tasks/components/taskCompletionUiState';

export function beginCompletionSubmit(
  state:      TaskCompletionUiState,
  generateId: () => string,
): TaskCompletionUiState {
  return onBeginSubmit(state, generateId);
}

export type CompletionSubmitDeps = {
  materialize?: (uri: string, mimeType: string) => Promise<MaterializeEvidencePhotoResult>;
  submit?: (
    attempt:   CompletionAttempt,
    task:      TaskCompletionTaskRef,
    loadPhoto: PhotoLoader,
    deps:      SubmitWithPhotosDeps,
  ) => Promise<SubmitWithPhotosResult>;
  onProgress?: (progress: SubmitProgress) => void;
};

export type CompletionSubmitOutcome = {
  state:      TaskCompletionUiState;
  // True only when the server confirmed the submission. The caller closes
  // the Modal / refreshes data / plays the success sound on this alone.
  completed:  boolean;
  submission: TaskCompletionSubmissionRow | null;
};

export async function finishCompletionSubmit(
  working: TaskCompletionUiState,
  task:    TaskCompletionTaskRef,
  deps:    CompletionSubmitDeps = {},
): Promise<CompletionSubmitOutcome> {
  const materialize = deps.materialize ?? ((uri, mime) => materializeEvidencePhoto(uri, mime));
  const submit      = deps.submit      ?? submitTaskCompletionWithPhotos;
  const fail = (state: TaskCompletionUiState): CompletionSubmitOutcome => ({ state, completed: false, submission: null });

  if (working.phase !== 'submitting' || !working.attempt) return fail(working); // defensive

  // Bytes are read lazily per photo, right before that photo's upload, and
  // never held in state.
  const loadPhoto: PhotoLoader = async (index) => {
    const selected = working.photos[index];
    if (!selected) return { ok: false };
    const read = await materialize(selected.previewUri, selected.mimeType);
    return read.ok ? { ok: true, photo: read.photo } : { ok: false };
  };

  try {
    const result = await submit(working.attempt, task, loadPhoto, { onProgress: deps.onProgress });
    if (result.ok) return { state: onSubmitSuccess(working), completed: true, submission: result.submission };

    switch (result.reason) {
      case 'uncertain':         return fail(onSubmitUncertain(working, result.attempt));
      case 'failed':            return fail(onSubmitRetryableFailed(working, result.attempt));
      case 'not_open':          return fail(onSubmitTerminalNotOpen(working));
      case 'not_authorized':    return fail(onSubmitTerminalNotAuthorized(working));
      case 'invalid_mime':      return fail({ ...onSubmitInvalidMime(working), attempt: result.attempt });
      case 'photo_read_failed': return fail(onLocalPhotoReadFailed(working, result.attempt));
      case 'too_many_photos':   return fail({ ...onSubmitRetryableFailed(working, result.attempt), error: { kind: 'too_many_photos' } });
    }
  } catch {
    return fail(onSubmitUnexpectedFailure(working));
  }
}

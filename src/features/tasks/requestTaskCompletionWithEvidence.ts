import {
  requestTaskCompletionV2,
  uploadTaskCompletionEvidence,
} from '@/lib/repositories';
import type { TaskCompletionSubmissionRow } from '@/types/supabase';
import { useAppStore } from '@/store/useAppStore';
import {
  buildTaskCompletionEvidencePath,
  classifyAndApplyUploadResult,
  classifyRpcError,
  onCh015,
  validateEvidenceMimeType,
  type TaskCompletionAttemptState,
} from './taskCompletionAttempt';

// Task Completion V2 evidence-upload orchestration — the imperative half of
// taskCompletionAttempt.ts's pure lifecycle module. Drives:
//   ensureEvidenceUploaded  — upload (or no-op / retry) for the current attempt
//   submitTaskCompletionWithEvidence — one upload-then-RPC pass
// No screen wiring yet — this slice is orchestration only, per the approved
// design; UI integration is a separate, later slice.

// Id generation (startNewAttempt/onPhotoChanged's generateId parameter) is
// deliberately NOT defined in this file — no UI wiring exists yet for this
// slice, so nothing here actually needs to mint an id. The future UI call
// site should define its own local Crypto.randomUUID() wrapper, exactly
// mirroring RewardCard.tsx's own generateClientRequestId() (a bare
// crypto.randomUUID() global is not guaranteed to exist in this Hermes/RN
// runtime; expo-crypto's randomUUID() is the established fix) — and, like
// that file, it should stay out of any module a unit test imports:
// expo-crypto cannot be resolved under Node's test runner (verified: a
// direct `import * as Crypto from 'expo-crypto'` here failed with
// ERR_MODULE_NOT_FOUND on Crypto.types, ESM resolution Metro/TS handle but
// plain Node does not), which is exactly why RewardCard.tsx's own copy of
// this wrapper has no test file either.

export type EvidencePhotoInput = {
  blob:     Blob;
  mimeType: string;
};

// A task_completion_submissions row is always attached to a real household-
// scoped task; narrowing the input type to exactly the two fields this
// module needs (rather than accepting the full, partially-optional Task
// type) makes a missing householdId a compile-time error instead of a
// runtime "should be unreachable" branch.
export type TaskCompletionTaskRef = {
  id:          string;
  householdId: string;
};

export type EnsureEvidenceUploadResult =
  | { kind: 'confirmed';         state: TaskCompletionAttemptState }
  | { kind: 'uncertain';         state: TaskCompletionAttemptState }
  | { kind: 'validation_error';  state: TaskCompletionAttemptState; reason: 'missing_mime' | 'unsupported_mime' }
  | { kind: 'not_authenticated'; state: TaskCompletionAttemptState }
  | { kind: 'not_configured';    state: TaskCompletionAttemptState };

// A photo-bearing attempt always has a non-null photoObjectId (see
// startNewAttempt/onPhotoChanged in taskCompletionAttempt.ts) — narrowing
// the state parameter's type here, rather than a runtime null check, makes
// calling this with a no-photo attempt a compile-time error. The no-photo
// path never calls this function at all (see submitTaskCompletionWithEvidence).
export type AttemptStateWithPhoto = NonNullable<TaskCompletionAttemptState> & {
  photoObjectId: string;
};

// Ensures evidence is uploaded for the current attempt, or reports why it
// isn't yet. Idempotent no-op if already 'confirmed'. Callers retry by
// invoking this again with the SAME state, task, and photo while the result
// is 'uncertain' — never with new ids (see classifyAndApplyUploadResult's
// own header comment for why 'not_configured' does not count as an
// uncertain/retryable-with-new-ids case either).
export async function ensureEvidenceUploaded(
  state:  AttemptStateWithPhoto,
  task:   TaskCompletionTaskRef,
  photo:  EvidencePhotoInput,
  uploadEvidenceFn: typeof uploadTaskCompletionEvidence = uploadTaskCompletionEvidence,
): Promise<EnsureEvidenceUploadResult> {
  if (state.evidenceUploadState === 'confirmed') {
    return { kind: 'confirmed', state };
  }

  const mimeCheck = validateEvidenceMimeType(photo.mimeType);
  if (mimeCheck !== 'ok') {
    return { kind: 'validation_error', state, reason: mimeCheck };
  }

  // profiles.id = auth.users.id (1:1) — the Storage INSERT policy
  // independently checks the path's caller segment against auth.uid(), so
  // this is read from the one authoritative source (AuthBootstrap-written
  // store state), never accepted as a parameter a screen could substitute.
  // Reading useAppStore.getState() directly from a feature-layer function
  // (not a React hook) mirrors requestTaskCompletion.ts's own existing
  // mock-mode branch — real repo precedent, not a new pattern.
  const callerId = useAppStore.getState().authUser?.id;
  if (!callerId) {
    return { kind: 'not_authenticated', state };
  }

  const path = buildTaskCompletionEvidencePath({
    householdId:          task.householdId,
    taskId:                task.id,
    submittedByProfileId: callerId,
    photoObjectId:         state.photoObjectId,
  });

  // Unconditional re-wrap, not a conditional check against the input
  // blob's own .type — that native provenance (fetch(uri).blob() on RN) is
  // unverifiable from this sandbox. Re-wrapping guarantees the multipart
  // Content-Type storage-js sends matches the trusted, picker-provided
  // mimeType regardless of what the native fetch/blob layer produced.
  // Verified against react-native/Libraries/Blob/Blob.js +
  // BlobManager.js's createFromParts: this constructor form is supported
  // and sets .type directly from the passed option.
  const typedBlob = new Blob([photo.blob], { type: photo.mimeType });

  // No contentType option passed to uploadEvidenceFn — verified against
  // the installed @supabase/storage-js@2.108.2 source (StorageFileApi.ts):
  // for a Blob body, that FileOption is never read; the actual stored
  // Content-Type is determined entirely by the Blob's own .type at
  // multipart-encoding time, which typedBlob above has already fixed.
  const { error } = await uploadEvidenceFn({ path, blob: typedBlob });

  const classified = classifyAndApplyUploadResult(state, error);
  return { kind: classified.kind, state: classified.state };
}

export type SubmitTaskCompletionResult =
  | { ok: true;  submission: TaskCompletionSubmissionRow }
  | {
      ok:     false;
      state:  TaskCompletionAttemptState;
      reason:
        | 'invalid_mime'
        | 'uncertain'
        | 'not_open'
        | 'not_authorized'
        | 'failed';
    };

// One upload-then-RPC pass for the current attempt. photo === null is the
// no-photo submission path (state.photoObjectId must already be null —
// see startNewAttempt) — it skips ensureEvidenceUploaded entirely and goes
// straight to the RPC, matching request_task_completion_v2's own
// DEFAULT NULL p_photo_object_id contract.
//
// Does not loop internally on 'uncertain' or CH015 — each call does exactly
// one upload attempt and, if reached, exactly one RPC attempt. A caller
// (future UI/retry-policy layer, out of scope for this slice) retries by
// invoking this function again with the returned state; CH015's own
// recovery is mechanically just another such call, since the returned
// state already has evidenceUploadState forced back to 'uncertain'.
export async function submitTaskCompletionWithEvidence(
  state: NonNullable<TaskCompletionAttemptState>,
  task:  TaskCompletionTaskRef,
  photo: EvidencePhotoInput | null,
  deps?: {
    uploadEvidenceFn?:    typeof uploadTaskCompletionEvidence;
    requestCompletionFn?: typeof requestTaskCompletionV2;
  },
): Promise<SubmitTaskCompletionResult> {
  const uploadEvidenceFn    = deps?.uploadEvidenceFn    ?? uploadTaskCompletionEvidence;
  const requestCompletionFn = deps?.requestCompletionFn ?? requestTaskCompletionV2;

  let currentState = state;

  // Photo/state consistency gate — load-bearing. Without this, a
  // photo-bearing attempt whose evidence is still 'not_uploaded' or
  // 'uncertain' could reach the RPC below simply by being called with
  // photo=null (e.g. a caller mistakenly treating any RPC-only call as
  // safe), even though its evidence was never resolved. Exactly one
  // combination is a legitimate RPC-only call with no photo: a
  // photo-bearing attempt that is already 'confirmed'. Every other
  // photo/state combination that doesn't match is a caller/state mismatch,
  // not a MIME problem and not a Storage outcome — reported as a generic
  // failure, with neither upload nor RPC ever invoked.
  const hasUnresolvedPhoto =
    currentState.photoObjectId !== null && currentState.evidenceUploadState !== 'confirmed';

  if (photo === null && hasUnresolvedPhoto) {
    return { ok: false, state: currentState, reason: 'failed' };
  }
  if (photo !== null && currentState.photoObjectId === null) {
    return { ok: false, state: currentState, reason: 'failed' };
  }

  if (photo !== null) {
    // currentState.photoObjectId !== null is guaranteed by the guard above.
    const uploadResult = await ensureEvidenceUploaded(
      currentState as AttemptStateWithPhoto,
      task,
      photo,
      uploadEvidenceFn,
    );

    currentState = uploadResult.state as NonNullable<TaskCompletionAttemptState>;

    switch (uploadResult.kind) {
      case 'validation_error':
        return { ok: false, state: currentState, reason: 'invalid_mime' };
      case 'not_authenticated':
        return { ok: false, state: currentState, reason: 'not_authorized' };
      case 'not_configured':
        return { ok: false, state: currentState, reason: 'failed' };
      case 'uncertain':
        return { ok: false, state: currentState, reason: 'uncertain' };
      case 'confirmed':
        break; // fall through to the RPC call below
    }
  }

  // Reached only for: a legitimate no-photo attempt (photoObjectId null,
  // photo null), a legitimate RPC-only retry (photoObjectId set, already
  // confirmed, photo omitted), or a photo just uploaded and confirmed
  // above — never with unresolved evidence, per the guard at the top.
  const rpcResult = await requestCompletionFn({
    taskId:          task.id,
    clientRequestId: currentState.clientRequestId,
    photoObjectId:   currentState.photoObjectId,
  });

  if (!rpcResult.error && rpcResult.data) {
    return { ok: true, submission: rpcResult.data };
  }

  const classification = classifyRpcError(rpcResult.error ?? undefined);

  // Intentionally inlined here rather than a separate pure onRpcOutcome
  // transition function in taskCompletionAttempt.ts: classifyRpcError
  // already isolates the only part of this that benefits from being pure
  // and independently testable (the ERRCODE-to-category mapping); the
  // state transition each category implies (clear / keep / force-uncertain)
  // is a single line per case with no branching logic of its own worth
  // extracting. Covers the same contract an onRpcOutcome function would.
  switch (classification) {
    case 'ch015':
      return { ok: false, state: onCh015(currentState), reason: 'uncertain' };
    case 'generic_failure':
      return { ok: false, state: currentState, reason: 'failed' };
    case 'terminal_not_open':
      return { ok: false, state: null, reason: 'not_open' };
    case 'terminal_not_authorized':
      return { ok: false, state: null, reason: 'not_authorized' };
    case 'terminal_other':
      return { ok: false, state: null, reason: 'failed' };
  }
}

import {
  requestTaskCompletionV2,
  requestTaskCompletionV3,
  uploadTaskCompletionEvidence,
} from '@/lib/repositories';
import type { TaskCompletionSubmissionRow } from '@/types/supabase';
import {
  ensureEvidenceUploaded,
  submitTaskCompletionWithEvidence,
  type EvidencePhotoInput,
  type TaskCompletionTaskRef,
} from './requestTaskCompletionWithEvidence';
import { classifyRpcError, type EvidenceUploadState } from './taskCompletionAttempt';

// Task Completion with up to MAX_EVIDENCE_PHOTOS photos — the multi-photo
// generalisation of requestTaskCompletionWithEvidence.ts, built ON it, not
// beside it:
//
//   0 or 1 photo  -> submitTaskCompletionWithEvidence + request_task_completion_v2,
//                    byte-for-byte the path already proven on device;
//   2..5 photos   -> every photo through the same ensureEvidenceUploaded
//                    (same canonical path, same verified-duplicate rule, same
//                    upsert:false upload), then ONE request_task_completion_v3
//                    call carrying the ordered photo ids.
//
// One logical attempt = one clientRequestId + one ordered list of
// photoObjectIds, all minted together (startCompletionAttempt). Retrying
// the same attempt reuses every id; already-confirmed photos are not read or
// uploaded again. Any change to the photo set is a NEW attempt (fresh ids
// for everything) — never an edit of this one.
//
// Photos are read lazily, one at a time, right before their own upload, so
// at most one photo's bytes are in memory at once (large-photo safety).

export const MAX_EVIDENCE_PHOTOS = 5;

export type EvidencePhotoSlot = {
  photoObjectId:       string;
  evidenceUploadState: EvidenceUploadState;
};

export type CompletionAttempt = {
  clientRequestId: string;
  photos:          readonly EvidencePhotoSlot[];
};

export function startCompletionAttempt(photoCount: number, generateId: () => string): CompletionAttempt {
  const clientRequestId = generateId();
  const photos: EvidencePhotoSlot[] = [];
  for (let i = 0; i < photoCount; i++) {
    photos.push({ photoObjectId: generateId(), evidenceUploadState: 'not_uploaded' });
  }
  return { clientRequestId, photos };
}

export type PhotoLoadResult = { ok: true; photo: EvidencePhotoInput } | { ok: false };
export type PhotoLoader     = (index: number) => Promise<PhotoLoadResult>;

export type SubmitProgress = { current: number; total: number };

export type SubmitWithPhotosFailureReason =
  | 'invalid_mime'
  | 'uncertain'
  | 'not_open'
  | 'not_authorized'
  | 'failed'
  | 'photo_read_failed'
  | 'too_many_photos';

export type SubmitWithPhotosResult =
  | { ok: true;  submission: TaskCompletionSubmissionRow }
  | {
      ok:          false;
      // null = this logical attempt can never succeed (terminal); the child
      // recovers by changing the photo set, which mints a new attempt.
      attempt:     CompletionAttempt | null;
      reason:      SubmitWithPhotosFailureReason;
      photoIndex?: number;
    };

export type SubmitWithPhotosDeps = {
  uploadEvidenceFn?: typeof uploadTaskCompletionEvidence;
  requestV2Fn?:      typeof requestTaskCompletionV2;
  requestV3Fn?:      typeof requestTaskCompletionV3;
  onProgress?:       (progress: SubmitProgress) => void;
};

export async function submitTaskCompletionWithPhotos(
  attempt:   CompletionAttempt,
  task:      TaskCompletionTaskRef,
  loadPhoto: PhotoLoader,
  deps:      SubmitWithPhotosDeps = {},
): Promise<SubmitWithPhotosResult> {
  const uploadEvidenceFn = deps.uploadEvidenceFn ?? uploadTaskCompletionEvidence;
  const total            = attempt.photos.length;

  if (total > MAX_EVIDENCE_PHOTOS) return { ok: false, attempt, reason: 'too_many_photos' };

  if (total <= 1) return submitSingle(attempt, task, loadPhoto, deps);

  let photos = [...attempt.photos];
  const withSlot = (i: number, slot: EvidencePhotoSlot): CompletionAttempt => {
    photos = photos.map((p, j) => (j === i ? slot : p));
    return { clientRequestId: attempt.clientRequestId, photos };
  };
  let current: CompletionAttempt = attempt;

  for (let i = 0; i < total; i++) {
    const slot = photos[i];
    if (slot.evidenceUploadState === 'confirmed') continue;
    deps.onProgress?.({ current: i + 1, total });

    const loaded = await loadPhoto(i);
    if (!loaded.ok) return { ok: false, attempt: current, reason: 'photo_read_failed', photoIndex: i };

    const uploaded = await ensureEvidenceUploaded(
      { clientRequestId: attempt.clientRequestId, photoObjectId: slot.photoObjectId, evidenceUploadState: slot.evidenceUploadState },
      task,
      loaded.photo,
      uploadEvidenceFn,
    );
    const nextState = uploaded.state?.evidenceUploadState ?? slot.evidenceUploadState;
    current = withSlot(i, { photoObjectId: slot.photoObjectId, evidenceUploadState: nextState });

    switch (uploaded.kind) {
      case 'confirmed':         break;
      case 'uncertain':         return { ok: false, attempt: current, reason: 'uncertain', photoIndex: i };
      case 'validation_error':  return { ok: false, attempt: current, reason: 'invalid_mime', photoIndex: i };
      case 'not_authenticated': return { ok: false, attempt: current, reason: 'not_authorized' };
      case 'not_configured':    return { ok: false, attempt: current, reason: 'failed' };
    }
  }

  const requestV3Fn = deps.requestV3Fn ?? requestTaskCompletionV3;
  const rpc = await requestV3Fn({
    taskId:          task.id,
    clientRequestId: attempt.clientRequestId,
    photoObjectIds:  photos.map((p) => p.photoObjectId),
  });
  if (!rpc.error && rpc.data) return { ok: true, submission: rpc.data };

  switch (classifyRpcError(rpc.error ?? undefined)) {
    case 'ch015':
      // Which object the server could not find is not reported, so every
      // photo goes back to 'uncertain' — the retry re-establishes each one
      // (a verified duplicate is a confirmation) with the SAME ids.
      return {
        ok: false,
        attempt: { clientRequestId: attempt.clientRequestId, photos: photos.map((p) => ({ ...p, evidenceUploadState: 'uncertain' as const })) },
        reason: 'uncertain',
      };
    case 'generic_failure':         return { ok: false, attempt: current, reason: 'failed' };
    case 'terminal_not_open':       return { ok: false, attempt: null, reason: 'not_open' };
    case 'terminal_not_authorized': return { ok: false, attempt: null, reason: 'not_authorized' };
    case 'terminal_other':          return { ok: false, attempt: null, reason: 'failed' };
  }
}

// 0 / 1 photo: the existing single-photo orchestration, unchanged.
async function submitSingle(
  attempt:   CompletionAttempt,
  task:      TaskCompletionTaskRef,
  loadPhoto: PhotoLoader,
  deps:      SubmitWithPhotosDeps,
): Promise<SubmitWithPhotosResult> {
  const slot = attempt.photos[0] ?? null;
  deps.onProgress?.({ current: 1, total: Math.max(1, attempt.photos.length) });

  // A confirmed photo is an RPC-only retry — no need to read it again.
  let photo: EvidencePhotoInput | null = null;
  if (slot && slot.evidenceUploadState !== 'confirmed') {
    const loaded = await loadPhoto(0);
    if (!loaded.ok) return { ok: false, attempt, reason: 'photo_read_failed', photoIndex: 0 };
    photo = loaded.photo;
  }

  const result = await submitTaskCompletionWithEvidence(
    {
      clientRequestId:     attempt.clientRequestId,
      photoObjectId:       slot?.photoObjectId ?? null,
      evidenceUploadState: slot?.evidenceUploadState ?? 'confirmed',
    },
    task,
    photo,
    {
      uploadEvidenceFn:    deps.uploadEvidenceFn,
      requestCompletionFn: deps.requestV2Fn,
    },
  );
  if (result.ok) return result;

  const back: CompletionAttempt | null = result.state === null ? null : {
    clientRequestId: result.state.clientRequestId,
    photos: result.state.photoObjectId === null
      ? []
      : [{ photoObjectId: result.state.photoObjectId, evidenceUploadState: result.state.evidenceUploadState }],
  };
  return { ok: false, attempt: back, reason: result.reason };
}

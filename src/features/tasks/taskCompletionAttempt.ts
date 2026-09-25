import { StorageApiError } from '@supabase/supabase-js';

// Task Completion V2 evidence-upload orchestration — pure lifecycle module.
// No React, no Supabase client, no I/O of any kind — mirrors
// src/domain/permissions.ts's own "pure business-rule module" convention.
// The imperative half (actually calling the repository layer) lives in
// requestTaskCompletionWithEvidence.ts, which imports from here.

// ── AttemptState ─────────────────────────────────────────────────────────
//
// One logical completion attempt = one clientRequestId + one photoObjectId
// (or null, for a no-photo submission) + how far the evidence upload has
// gotten. Both ids are minted together, once, at the start of a logical
// attempt — never independently, never regenerated merely to make a retry
// easier (client_request_id is an idempotency key; see
// request_task_completion_v2's own CH014 semantics).
export type EvidenceUploadState = 'not_uploaded' | 'confirmed' | 'uncertain';

export type TaskCompletionAttemptState =
  | {
      clientRequestId:     string;
      photoObjectId:       string | null;
      evidenceUploadState: EvidenceUploadState;
    }
  | null; // null = no attempt in flight

// Starts a new logical attempt. hasPhoto = false means a no-photo
// submission — there is nothing to upload, so evidenceUploadState starts
// (and stays) 'confirmed' rather than 'not_uploaded', since "confirmed"
// here just means "evidence is in whatever state it needs to be for the
// RPC to run," which for no photo is trivially true from the start.
export function startNewAttempt(
  hasPhoto:   boolean,
  generateId: () => string,
): NonNullable<TaskCompletionAttemptState> {
  return {
    clientRequestId:     generateId(),
    photoObjectId:       hasPhoto ? generateId() : null,
    evidenceUploadState: hasPhoto ? 'not_uploaded' : 'confirmed',
  };
}

// A photo change (pick a different photo, or remove the one selected) is
// unconditionally a new logical attempt — never a mutation of the current
// one. Verified against request_task_completion_v2's own CH014 check: any
// existing submission row for a reused client_request_id has its
// photo_storage_path compared against the newly-supplied photo_object_id's
// expected path, and a mismatch raises CH014. Reusing the old
// clientRequestId with a new photoObjectId is therefore never safe, whether
// or not the old id was ever actually sent to the RPC yet.
export function onPhotoChanged(
  hasPhoto:   boolean,
  generateId: () => string,
): NonNullable<TaskCompletionAttemptState> {
  return startNewAttempt(hasPhoto, generateId);
}

// ── Duplicate predicate ──────────────────────────────────────────────────
//
// Narrowest safe predicate for "this upload failed because the object
// already exists at this exact path" — verified against a real duplicate-
// upload experiment in the QA Supabase project (umzfyedxnvtmfnwldwtq):
// raw HTTP status 400, JSON body statusCode "409", error "Duplicate".
// storage-js's handleError (fetch.ts) populates .status from the raw HTTP
// status and .statusCode from the JSON body's own statusCode field — both
// confirmed against the installed @supabase/storage-js@2.108.2 source, not
// guessed. Deliberately does NOT key on error.message — that field's
// content is less guaranteed stable than status/statusCode, which are
// already pinned down by the QA evidence above.
export function isVerifiedDuplicateUploadError(error: unknown): boolean {
  return (
    error instanceof StorageApiError &&
    error.status === 400 &&
    error.statusCode === '409'
  );
}

// ── Upload-result classification ─────────────────────────────────────────
//
// Only three Storage-network outcomes are ever distinguished: success,
// verified duplicate (both → 'confirmed'), and everything else → 'uncertain'.
// No other error shape from Storage (a different 4xx, a 5xx, or a genuine
// network failure with no HTTP response at all) is treated as proof that no
// object was written — the installed storage-js source defines no error-
// code taxonomy for file Storage at all (StorageApiError/StorageUnknownError
// only carry whatever status/statusCode the server happened to send; the
// only enum in the package, StorageVectorsErrorCode, belongs to the
// unrelated S3-Vectors sub-API) and no live QA exists for any case besides
// the verified-duplicate one above. Treating any of them as certain would
// be an unsupported claim, not an inference this codebase's own evidence
// backs.
export type UploadOutcome =
  | { kind: 'success' }
  | { kind: 'duplicate' };

export function onUploadOutcome(
  state:   NonNullable<TaskCompletionAttemptState>,
  outcome: UploadOutcome,
): NonNullable<TaskCompletionAttemptState> {
  void outcome; // both 'success' and 'duplicate' resolve identically — kept as a discriminated param for call-site clarity, not branched on
  return { ...state, evidenceUploadState: 'confirmed' };
}

export function onUploadUncertain(
  state: NonNullable<TaskCompletionAttemptState>,
): NonNullable<TaskCompletionAttemptState> {
  return { ...state, evidenceUploadState: 'uncertain' };
}

// The PGRST_NOT_CONFIGURED sentinel (see repositories/types.ts's
// notConfiguredError()) is a pre-network condition, never a Storage
// outcome — uploadTaskCompletionEvidence returns it without ever calling
// storage.upload() at all. It must be checked before, and separately from,
// the duplicate/uncertain classification above, or a "Supabase isn't
// configured" condition would be misclassified as upload ambiguity and
// wrongly activate retry semantics for an object that was never even
// attempted.
function isNotConfiguredError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'PGRST_NOT_CONFIGURED'
  );
}

// Classifies a raw uploadTaskCompletionEvidence() result and applies the
// matching state transition in one step. state is returned unchanged for
// 'not_configured' — this is an environment condition, not a fact about
// this attempt being invalid, so clearing or regenerating ids here would
// violate the "never mint new ids merely to make a retry easier" rule.
export function classifyAndApplyUploadResult(
  state: NonNullable<TaskCompletionAttemptState>,
  error: unknown,
): { kind: 'confirmed' | 'uncertain' | 'not_configured'; state: TaskCompletionAttemptState } {
  if (!error) {
    return { kind: 'confirmed', state: onUploadOutcome(state, { kind: 'success' }) };
  }
  if (isNotConfiguredError(error)) {
    return { kind: 'not_configured', state };
  }
  if (isVerifiedDuplicateUploadError(error)) {
    return { kind: 'confirmed', state: onUploadOutcome(state, { kind: 'duplicate' }) };
  }
  return { kind: 'uncertain', state: onUploadUncertain(state) };
}

// ── CH015 recovery ────────────────────────────────────────────────────────
//
// CH015 ("Evidence object not found") is NOT terminal. Verified against the
// actual migration (20260910000000_task_completion_v2_and_task_governance.sql,
// lines 296-316): the tasks UPDATE that flips status to 'needs_attention'
// runs before the CH015 check, inside the same function with no enclosing
// exception handler — an uncaught RAISE EXCEPTION rolls back that whole
// implicit transaction, so the task genuinely reverts to 'open' and no
// task_completion_submissions row is ever inserted. Recovery: force
// evidenceUploadState back to 'uncertain' (regardless of what it was),
// preserve both ids, and let the ordinary upload-retry path (§ above)
// re-establish whether the object exists before the RPC is retried with the
// same ids. No automatic loop lives here — how many times a caller invokes
// this recovery is a retry-policy/UI decision, deliberately out of scope
// for this module.
export function onCh015(
  state: NonNullable<TaskCompletionAttemptState>,
): NonNullable<TaskCompletionAttemptState> {
  return { ...state, evidenceUploadState: 'uncertain' };
}

// ── RPC-error classification ─────────────────────────────────────────────
//
// Maps request_task_completion_v2's own documented ERRCODEs (see
// taskCompletionV2.ts's own header comments) to the four categories the
// orchestration needs to decide what to do next. Every other/unrecognized
// code collapses to 'generic_failure' — matches this codebase's existing
// convention (requestTaskCompletion.ts's own NOT_OPEN_CODE handling) of
// mapping only the codes that change orchestration behavior and treating
// everything else as generically retryable.
export type RpcErrorClassification =
  | 'ch015'
  | 'terminal_not_open'
  | 'terminal_not_authorized'
  | 'terminal_other'
  | 'generic_failure';

export function classifyRpcError(
  error: { code?: string } | null | undefined,
): RpcErrorClassification {
  switch (error?.code) {
    case 'CH015': return 'ch015';
    case 'CH003': return 'terminal_not_open';
    case '28000': return 'terminal_not_authorized';
    case 'CH014':
    case 'CH018':
    case 'CH019':
      return 'terminal_other';
    default:
      return 'generic_failure';
  }
}

// ── Canonical evidence Storage path ──────────────────────────────────────
//
// Reproduces, not invents, the exact 4-segment formula
// request_task_completion_v2 itself builds server-side (see that RPC's own
// v_expected_path construction) and the Storage INSERT policy's
// foldername() check independently re-derives. This is the ONLY place in
// the orchestration layer that constructs this path — the public upload
// API never accepts a raw path from a caller (see
// requestTaskCompletionWithEvidence.ts).
export function buildTaskCompletionEvidencePath(input: {
  householdId:          string;
  taskId:               string;
  submittedByProfileId: string;
  photoObjectId:        string;
}): string {
  return `${input.householdId}/${input.taskId}/${input.submittedByProfileId}/${input.photoObjectId}`;
}

// ── MIME validation ───────────────────────────────────────────────────────
//
// Mirrors the task-completion-evidence bucket's own allowed_mime_types
// exactly (supabase/migrations/20260921000000_task_completion_evidence_storage.sql)
// — not re-derived at runtime, since Storage doesn't expose bucket config
// to the client. mimeType is sourced from the picker's own asset.mimeType
// field, not from blob.type (whose native provenance on RN is unverifiable
// from this sandbox) and not from a filename extension (the canonical path
// has none).
export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
] as const;

export type AllowedEvidenceMimeType = (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number];

export type EvidenceMimeValidation = 'ok' | 'missing_mime' | 'unsupported_mime';

export function validateEvidenceMimeType(
  mimeType: string | null | undefined,
): EvidenceMimeValidation {
  if (!mimeType) return 'missing_mime';
  return (ALLOWED_EVIDENCE_MIME_TYPES as readonly string[]).includes(mimeType)
    ? 'ok'
    : 'unsupported_mime';
}

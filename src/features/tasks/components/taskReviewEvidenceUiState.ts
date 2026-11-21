// Pure state module for the reviewer Task Completion Evidence Modal.
// No React, no Expo, no react-native, no Supabase, no file system —
// node-test safe. The Modal owns native concerns (fetch of evidence bytes,
// writing them to a temporary cache file, async-cancellation refs);
// this module owns the state machine the Modal reads/updates.
//
// Decision gating is this module's central invariant:
//
//     ready_no_photo   → Approve/Reject allowed
//     ready_with_photo → Approve/Reject allowed (EVERY photo loaded)
//     anything else    → Approve/Reject NOT allowed
//
// A photo-bearing submission whose evidence has NOT been loaded (or
// failed to load / failed to convert) must not reach the action — the
// reviewer cannot decide without seeing it, by product rule. With several
// photos that means all of them.

import {
  evidencePhotoCount,
  type TaskCompletionReviewContext,
} from '@/features/tasks/getTaskCompletionReviewContext';

export type ReviewDecision = 'approve' | 'reject';

export type ReviewPhase =
  // Context not yet loaded (modal just opened).
  | 'loading_context'
  // Submission has no photo — reviewer may decide immediately.
  | 'ready_no_photo'
  // Fetching evidence bytes (hasPhoto=true, no cache file yet).
  | 'loading_evidence'
  // Evidence written to a cache file (file:// URI) — reviewer may decide.
  | 'ready_with_photo'
  // Fetch rejected OR the bytes could not be written to a cache file. Retryable.
  | 'evidence_failed'
  // Approve in flight.
  | 'approving'
  // Reject in flight.
  | 'rejecting'
  // Approve/Reject returned a retryable failure. Context + evidence
  // preserved so the reviewer can retry without re-loading.
  | 'action_failed'
  // No pending submission exists (e.g. task was reviewed in another
  // session). Terminal — Approve/Reject not allowed; close is the only
  // way out.
  | 'terminal_not_found'
  // Approve/Reject returned CH017 (submission already reviewed).
  // Terminal.
  | 'terminal_not_pending'
  // Permission denied by server (28000) OR by client permission gate.
  // Terminal.
  | 'terminal_not_authorized';

export type ReviewErrorKind =
  | 'context_failed'          // context lookup threw a repository error
  | 'evidence_failed'         // fetchTaskCompletionEvidence failed OR bytes could not become an image source
  | 'action_failed'           // approve/reject returned reason 'failed'
  | 'not_found'               // no pending submission
  | 'not_pending'             // CH017 — submission already reviewed
  | 'not_authorized';         // permission denied

export interface TaskReviewUiState {
  decision:        ReviewDecision;
  context:         TaskCompletionReviewContext | null;
  // First photo (kept for single-photo callers) and every photo by index.
  evidenceUri:     string | null;
  evidenceUris:    readonly (string | null)[];
  phase:           ReviewPhase;
  error:           { kind: ReviewErrorKind } | null;
}

export function initialReviewState(decision: ReviewDecision): TaskReviewUiState {
  return {
    decision,
    context:         null,
    evidenceUri:     null,
    evidenceUris:    [],
    phase:           'loading_context',
    error:           null,
  };
}

// ── Context lookup transitions ────────────────────────────────────────────

export function onContextLoaded(
  state:   TaskReviewUiState,
  context: TaskCompletionReviewContext,
): TaskReviewUiState {
  const count = evidencePhotoCount(context);
  return {
    ...state,
    context,
    evidenceUri:  null,
    evidenceUris: Array.from({ length: count }, () => null),
    phase: count > 0 ? 'loading_evidence' : 'ready_no_photo',
    error: null,
  };
}

export function onContextNotFound(state: TaskReviewUiState): TaskReviewUiState {
  return { ...state, phase: 'terminal_not_found', error: { kind: 'not_found' } };
}

export function onContextNotAuthorized(state: TaskReviewUiState): TaskReviewUiState {
  return { ...state, phase: 'terminal_not_authorized', error: { kind: 'not_authorized' } };
}

export function onContextFailed(state: TaskReviewUiState): TaskReviewUiState {
  // Retryable — context load may be re-attempted by the Modal (reopens
  // the review flow, which restarts the state machine from
  // initialReviewState); we don't carry a transient "context failed"
  // non-terminal phase because the Modal has no in-place context retry
  // UI for this slice. Any context failure surfaces as `evidence_failed`
  // equivalent so the shared retry affordance covers it.
  return { ...state, phase: 'evidence_failed', error: { kind: 'context_failed' } };
}

// ── Evidence transitions (photo-bearing path only) ────────────────────────

// One photo is ready. Decidable only once EVERY photo is; a photo arriving
// while another one has failed keeps the failure visible (retry needed).
export function onEvidenceLoaded(
  state:   TaskReviewUiState,
  fileUri: string,
  index:   number = 0,
): TaskReviewUiState {
  if (!state.context) return state;
  const count = evidencePhotoCount(state.context);
  if (index < 0 || index >= count) return state;
  const uris = Array.from({ length: count }, (_, i) => (i === index ? fileUri : state.evidenceUris[i] ?? null));
  const allLoaded = uris.every((u) => u !== null);
  const base = { ...state, evidenceUris: uris, evidenceUri: uris[0] ?? null };
  if (state.phase === 'evidence_failed') return base;
  if (state.phase !== 'loading_evidence') return base;
  return allLoaded ? { ...base, phase: 'ready_with_photo', error: null } : base;
}

export function onEvidenceFailed(state: TaskReviewUiState): TaskReviewUiState {
  return { ...state, phase: 'evidence_failed', error: { kind: 'evidence_failed' } };
}

export function onEvidenceRetry(state: TaskReviewUiState): TaskReviewUiState {
  // Only meaningful from `evidence_failed`. Returns to `loading_evidence`
  // (context already loaded, hasPhoto=true). Idempotent elsewhere.
  if (state.phase !== 'evidence_failed') return state;
  if (!state.context || !state.context.hasPhoto)   return state;
  // Already-loaded photos are kept; only the missing ones load again.
  const allLoaded = state.evidenceUris.length > 0 && state.evidenceUris.every((u) => u !== null);
  return { ...state, phase: allLoaded ? 'ready_with_photo' : 'loading_evidence', error: null };
}

// Indexes still to load (for the Modal's retry).
export function missingEvidenceIndexes(state: TaskReviewUiState): number[] {
  return state.evidenceUris.flatMap((u, i) => (u === null ? [i] : []));
}

// ── Decision gating ───────────────────────────────────────────────────────

export function canConfirmDecision(state: TaskReviewUiState): boolean {
  return state.phase === 'ready_no_photo' || state.phase === 'ready_with_photo';
}

// ── Action transitions ────────────────────────────────────────────────────

export function onBeginApprove(state: TaskReviewUiState): TaskReviewUiState | null {
  if (!canConfirmDecision(state)) return null;
  return { ...state, phase: 'approving', error: null };
}

export function onBeginReject(state: TaskReviewUiState): TaskReviewUiState | null {
  if (!canConfirmDecision(state)) return null;
  return { ...state, phase: 'rejecting', error: null };
}

export function onActionFailed(state: TaskReviewUiState): TaskReviewUiState {
  // Retains submissionId, context, and evidenceUri. The reviewer may
  // retry the same decision without re-loading evidence.
  return { ...state, phase: 'action_failed', error: { kind: 'action_failed' } };
}

export function onActionNotPending(state: TaskReviewUiState): TaskReviewUiState {
  return { ...state, phase: 'terminal_not_pending', error: { kind: 'not_pending' } };
}

export function onActionNotAuthorized(state: TaskReviewUiState): TaskReviewUiState {
  return { ...state, phase: 'terminal_not_authorized', error: { kind: 'not_authorized' } };
}

// Returning to a decidable state after an `action_failed` so the reviewer
// can retry. The decision is preserved; evidence is still rendered if it
// was loaded. hasPhoto chooses the exact ready phase.
export function onReturnToReady(state: TaskReviewUiState): TaskReviewUiState {
  if (!state.context) return state;
  return {
    ...state,
    phase: state.context.hasPhoto ? 'ready_with_photo' : 'ready_no_photo',
    error: null,
  };
}

// ── Terminal checks ───────────────────────────────────────────────────────

export function isTerminalPhase(state: TaskReviewUiState): boolean {
  return state.phase === 'terminal_not_found'
      || state.phase === 'terminal_not_pending'
      || state.phase === 'terminal_not_authorized';
}

import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import type { PostgrestError, StorageApiError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { supabaseKey, supabaseUrl } from '@/lib/supabaseConfig';
import type { TaskCompletionSubmissionRow } from '@/types/supabase';
import { notConfiguredError } from './types';
import type { RepositoryResult } from './types';

// Sibling to RepositoryResult<T> — supabase.functions.invoke()'s error is
// FunctionsHttpError | FunctionsRelayError | FunctionsFetchError, not a
// PostgrestError, so it can't reuse RepositoryResult without a false cast.
// PostgrestError is included explicitly (not via ReturnType<typeof
// notConfiguredError>) for the not-configured branch — notConfiguredError()
// is itself typed to return PostgrestError, confirmed in ./types.ts.
export type EdgeFunctionResult<T> =
  | { data: T;    error: null }
  | { data: null; error: FunctionsHttpError | FunctionsRelayError | FunctionsFetchError | PostgrestError };

// Calls the request_task_completion_v2 RPC (SECURITY DEFINER — see
// supabase/migrations/20260910000000_task_completion_v2_and_task_governance.sql).
// Child-submitted completion request with optional photo evidence. The RPC
// derives the caller from auth.uid() itself; this function never sends a
// target profile id. clientRequestId and photoObjectId are supplied by the
// caller, not generated here — client_request_id is an idempotency key, so
// a retry of the same logical attempt must reuse the same value, and
// photoObjectId identifies a Storage object this function does not create
// or verify; both belong to a future upload-orchestration layer.
// On failure, error.code may be '28000' (not authenticated/authorized),
// 'CH003' (task not open), 'CH014' (incompatible idempotency-key reuse),
// 'CH015' (evidence object not found), 'CH018' (evidence already attached
// to another submission), or 'CH019' (workflow invariant violation) —
// every code is mapped by the caller, none are interpreted here.
export async function requestTaskCompletionV2(input: {
  taskId:          string;
  clientRequestId: string;
  photoObjectId?:  string | null;
}): Promise<RepositoryResult<TaskCompletionSubmissionRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.rpc('request_task_completion_v2', {
    p_task_id:           input.taskId,
    p_client_request_id: input.clientRequestId,
    p_photo_object_id:   input.photoObjectId ?? null,
  });
  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

// Calls the request_task_completion_v3 RPC (SECURITY DEFINER — see
// supabase/migrations/20261030000000_task_completion_multi_photo.sql): the
// v2 contract with an ordered list of up to 5 photo object ids instead of
// one. The RPC delegates the attempt state machine to v2 unchanged and
// attaches photos 2..5 in the same transaction. Same caller-supplied
// idempotency rules as v2 — a retry of one logical attempt sends the same
// clientRequestId AND the same ordered ids. Extra error codes: 'CH021'
// (invalid photo set — over 5, NULL or duplicate ids), plus CH014/CH015/
// CH018 for photos 2..5 with v2's meanings.
export async function requestTaskCompletionV3(input: {
  taskId:          string;
  clientRequestId: string;
  photoObjectIds:  readonly string[];
}): Promise<RepositoryResult<TaskCompletionSubmissionRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.rpc('request_task_completion_v3', {
    p_task_id:           input.taskId,
    p_client_request_id: input.clientRequestId,
    p_photo_object_ids:  [...input.photoObjectIds],
  });
  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

// Metadata-only view of task_completion_submissions for list screens
// (reviewer photo-count badges, Assigned status). Never includes
// photo_storage_path; photo_count is a count, not a reference to evidence.
export type TaskSubmissionSummaryRow = {
  id:                      string;
  task_id:                 string;
  status:                  TaskCompletionSubmissionRow['status'];
  submitted_by_profile_id: string;
  submitted_at:            string;
  reviewed_at:             string | null;
  photo_count:             number;
};

const SUMMARY_COLUMNS = 'id, task_id, status, submitted_by_profile_id, submitted_at, reviewed_at';
// Postgres undefined_column — the backend predates the multi-photo
// migration (no photo_count yet).
const UNDEFINED_COLUMN = '42703';
const SUMMARY_LIMIT = 300;

// Household-scoped, newest first. RLS decides what comes back: an adult+
// sees the household's submissions, a child only their own. Without the
// multi-photo migration photo_count does not exist yet; then the count is
// derived (0/1) from whether photo 1 exists, and the path itself is dropped
// right here — it never leaves this function.
export async function getTaskSubmissionSummariesForHousehold(
  householdId: string,
): Promise<RepositoryResult<TaskSubmissionSummaryRow[]>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const primary = await supabase
    .from('task_completion_submissions')
    .select(`${SUMMARY_COLUMNS}, photo_count`)
    .eq('household_id', householdId)
    .order('submitted_at', { ascending: false })
    .limit(SUMMARY_LIMIT);

  if (!primary.error) {
    return {
      data: (primary.data ?? []).map((r) => ({ ...r, photo_count: r.photo_count ?? 0 })),
      error: null,
    };
  }
  if (primary.error.code !== UNDEFINED_COLUMN) return { data: null, error: primary.error };

  const legacy = await supabase
    .from('task_completion_submissions')
    .select(`${SUMMARY_COLUMNS}, photo_storage_path`)
    .eq('household_id', householdId)
    .order('submitted_at', { ascending: false })
    .limit(SUMMARY_LIMIT);
  if (legacy.error) return { data: null, error: legacy.error };
  return {
    data: (legacy.data ?? []).map(({ photo_storage_path, ...r }) => ({
      ...r,
      photo_count: photo_storage_path === null ? 0 : 1,
    })),
    error: null,
  };
}

// Reads the single pending task_completion_submissions row for a task,
// if one exists. Narrow convenience over the general select API — the
// schema's partial unique index `uq_tcs_one_pending_per_task` on
// (task_id) WHERE status = 'pending' guarantees at most one row, so
// .maybeSingle() is safe (returns the row OR null, never multiple).
// Authentication is enforced by the shipped RLS policy
// task_completion_submissions_select_self_or_adult_plus (adult+ members
// of the submission's household can see pending rows). No service-role.
// No cross-household data leak.
export async function getPendingTaskCompletionSubmissionForTask(
  taskId: string,
): Promise<RepositoryResult<TaskCompletionSubmissionRow | null>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase
    .from('task_completion_submissions')
    .select('*')
    .eq('task_id', taskId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) return { data: null, error };
  return { data: data ?? null, error: null };
}

// Calls the approve_task_completion_v2 RPC (SECURITY DEFINER — see
// supabase/migrations/20260910000000_task_completion_v2_and_task_governance.sql).
// Privileged (owner/admin/adult) review of a pending v2 submission — the RPC
// derives the caller from auth.uid() itself; this function never sends a
// target profile id. On failure, error.code may be '28000' (not
// authenticated/authorized), 'CH017' (submission not pending review), or
// 'CH019' (workflow invariant violation) — every code is mapped by the
// caller, none are interpreted here.
export async function approveTaskCompletionV2(
  submissionId: string,
): Promise<RepositoryResult<TaskCompletionSubmissionRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.rpc('approve_task_completion_v2', {
    p_submission_id: submissionId,
  });
  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

// Calls the reject_task_completion_v2 RPC (SECURITY DEFINER — see
// supabase/migrations/20260910000000_task_completion_v2_and_task_governance.sql).
// Privileged (owner/admin/adult) rejection of a pending v2 submission — the
// RPC derives the caller from auth.uid() itself; this function never sends
// a target profile id. On failure, error.code may be '28000' (not
// authenticated/authorized), 'CH017' (submission not pending review), or
// 'CH019' (workflow invariant violation) — every code is mapped by the
// caller, none are interpreted here.
export async function rejectTaskCompletionV2(
  submissionId: string,
): Promise<RepositoryResult<TaskCompletionSubmissionRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.rpc('reject_task_completion_v2', {
    p_submission_id: submissionId,
  });
  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

// Calls the withdraw_task_completion_v2 RPC (SECURITY DEFINER — see
// supabase/migrations/20261029010000_withdraw_task_completion_v2.sql).
// The submitting child takes back their own still-pending submission:
// submission -> 'withdrawn', task -> 'open', no points, evidence untouched.
// Idempotent for an already-withdrawn submission. On failure, error.code
// may be '28000' (not authenticated / not the submitting child),
// 'CH017' (no longer pending — already approved or rejected), or 'CH019'
// (workflow invariant violation) — mapped by the caller, not here.
export async function withdrawTaskCompletionV2(
  submissionId: string,
): Promise<RepositoryResult<TaskCompletionSubmissionRow>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.rpc('withdraw_task_completion_v2', {
    p_submission_id: submissionId,
  });
  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

// Calls the task-completion-evidence Edge Function (see
// supabase/functions/task-completion-evidence) — the only sanctioned read
// path for evidence bytes (see that function's own header comment for why:
// Supabase Storage's Smart CDN can keep serving a previously authorized
// private object after access is revoked; this function re-checks live
// authorization on every call instead). Sends ONLY { submission_id } — the
// evidence Storage path is derived server-side from the authorized DB row
// and is never accepted from, or constructed by, the caller. This function
// never returns or exposes a direct Storage URL of any kind; on success,
// the actual image bytes are returned raw (ArrayBuffer) together with the
// response's Content-Type, which the Edge Function sets from the stored
// object's own type. On failure, error is a
// FunctionsHttpError (function returned non-2xx — status/body are on
// error.context, not interpreted here), FunctionsRelayError, or
// FunctionsFetchError — every case is mapped by the caller.
//
// Why direct fetch, not supabase.functions.invoke: @supabase/functions-js
// at the installed version decodes any response whose Content-Type is
// outside its explicit binary list (only application/octet-stream and
// application/pdf) with response.text(), which UTF-8-decodes binary bytes
// and corrupts image/* evidence (verified live, QA-05). Direct fetch with
// response.arrayBuffer() preserves exact bytes. NOT response.blob(): on
// Android (Expo SDK 56) the global fetch is expo/fetch, whose blob() builds
// `new Blob([arrayBuffer])`, which React Native's Blob rejects — every
// reviewer photo would fail to load. Request contract is otherwise
// unchanged: same URL, method, body, apikey, and Authorization bearer.
// The functional security contract (submission_id → live authorization →
// DB-derived path → bytes) is untouched; X-Client-Info is a telemetry-only
// label and is intentionally omitted from the direct-fetch headers.
//
// Public API has no caller-controllable fields: endpoint URL, apikey, and
// Authorization bearer are all resolved from the module-level supabase
// client / supabaseConfig. A screen cannot substitute any of them.
export type TaskCompletionEvidenceBytes = {
  bytes:    ArrayBuffer;
  // Raw Content-Type header value ('' when absent). Validated against the
  // evidence MIME allow-list by the caller before rendering.
  mimeType: string;
};

// photoIndex is 0-based: 0 = photo 1 (the only photo of any pre-multi-photo
// submission). It is sent only when > 0, so photo 1 keeps the exact
// { submission_id } body every deployed version of the function accepts.
export async function fetchTaskCompletionEvidence(
  submissionId: string,
  photoIndex:   number = 0,
): Promise<EdgeFunctionResult<TaskCompletionEvidenceBytes>> {
  if (!supabase) return { data: null, error: notConfiguredError() };
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? supabaseKey;
  return fetchEvidenceWithTransport(submissionId, photoIndex, {
    endpointUrl: `${supabaseUrl}/functions/v1/task-completion-evidence`,
    apiKey:      supabaseKey,
    bearerToken: accessToken,
    fetchFn:     globalThis.fetch.bind(globalThis),
  });
}

// Module-private. Not exported; not reachable from the repository barrel.
// The public fetchTaskCompletionEvidence above is the only sanctioned
// entry point to the Edge Function. Extracted into a helper purely for
// local readability — tests do NOT import it; they drive the real public
// function with env-controlled `supabaseConfig` + stubbed globalThis.fetch
// + stubbed supabase.auth.getSession in a process-isolated test file (see
// src/lib/repositories/__tests__/taskCompletionV2.evidenceFetch.test.ts).
async function fetchEvidenceWithTransport(
  submissionId: string,
  photoIndex:   number,
  transport: {
    endpointUrl: string;
    apiKey:      string;
    bearerToken: string;
    fetchFn:     typeof fetch;
  },
): Promise<EdgeFunctionResult<TaskCompletionEvidenceBytes>> {
  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey:         transport.apiKey,
      Authorization:  `Bearer ${transport.bearerToken}`,
    },
    body: JSON.stringify(
      photoIndex > 0 ? { submission_id: submissionId, photo_index: photoIndex } : { submission_id: submissionId },
    ),
  };

  let response: Response;
  try {
    response = await transport.fetchFn(transport.endpointUrl, requestInit);
  } catch (fetchError) {
    return { data: null, error: new FunctionsFetchError(fetchError) };
  }

  if (response.headers.get('x-relay-error') === 'true') {
    return { data: null, error: new FunctionsRelayError(response) };
  }

  if (!response.ok) {
    return { data: null, error: new FunctionsHttpError(response) };
  }

  // Body-consumption may itself reject (truncated stream, decoding failure,
  // runtime-specific body errors). Route such a failure through
  // the same existing repository error contract rather than escaping as an
  // uncaught exception. FunctionsFetchError is the closest existing
  // classification: installed @supabase/functions-js (verified against its
  // own types.ts) carries FunctionsFetchError for every rejection raised
  // "before/during request OR while receiving the body" when wrapping
  // fetch, and does not define a separate body-consumption class.
  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (bodyError) {
    return { data: null, error: new FunctionsFetchError(bodyError) };
  }
  return { data: { bytes, mimeType: response.headers.get('content-type') ?? '' }, error: null };
}

// Sibling to RepositoryResult<T> and EdgeFunctionResult<T> — the caller
// (features/tasks/requestTaskCompletionWithEvidence.ts) runs its own
// duplicate/ambiguous classification against the real Storage error shape
// (see isVerifiedDuplicateUploadError in features/tasks/taskCompletionAttempt.ts),
// which needs the real status/statusCode a lossy-normalized PostgrestError
// sentinel (the pattern profiles.ts's storageError() uses for avatars)
// would destroy. StorageUnknownError isn't exported by @supabase/supabase-js
// (only StorageApiError is, confirmed in that package's own src/index.ts),
// so the fallback branch is typed as the standard global Error —
// StorageUnknownError extends StorageError extends Error, so this is exact,
// not a loosening.
export type StorageUploadResult<T> =
  | { data: T;    error: null }
  | { data: null; error: StorageApiError | PostgrestError | Error };

// Uploads raw evidence bytes with the trusted, picker-provided MIME type
// (see features/tasks/requestTaskCompletionWithEvidence.ts) to the
// task-completion-evidence bucket, at an already-constructed canonical
// path (see buildTaskCompletionEvidencePath in
// features/tasks/taskCompletionAttempt.ts). Path construction is
// deliberately NOT this repository's job — unlike uploadProfileAvatarImage's
// own-path-per-upload pattern for avatars, the evidence path formula
// depends on task/household/attempt identity this repository has no
// business reconstructing, and is fixed by request_task_completion_v2
// itself (see that RPC's own migration comment).
// upsert is always false, never caller-configurable — evidence is immutable
// once uploaded; hard-coding this here closes off "just pass upsert:true"
// as an option by construction, not by convention.
// The body is an ArrayBuffer, not a Blob: React Native cannot build a Blob
// from bytes (see features/tasks/materializeEvidencePhoto.ts). For a
// non-Blob/non-FormData body storage-js sends the bytes raw with
// content-type = contentType, which the bucket's allowed_mime_types checks.
export async function uploadTaskCompletionEvidence(input: {
  path:        string;
  bytes:       ArrayBuffer;
  contentType: string;
}): Promise<StorageUploadResult<{ path: string }>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.storage
    .from('task-completion-evidence')
    .upload(input.path, input.bytes, { upsert: false, contentType: input.contentType });

  if (error) return { data: null, error };
  return { data: { path: data.path }, error: null };
}

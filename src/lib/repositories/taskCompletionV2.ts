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

// Calls the task-completion-evidence Edge Function (see
// supabase/functions/task-completion-evidence) — the only sanctioned read
// path for evidence bytes (see that function's own header comment for why:
// Supabase Storage's Smart CDN can keep serving a previously authorized
// private object after access is revoked; this function re-checks live
// authorization on every call instead). Sends ONLY { submission_id } — the
// evidence Storage path is derived server-side from the authorized DB row
// and is never accepted from, or constructed by, the caller. This function
// never returns or exposes a direct Storage URL of any kind; on success,
// the actual image bytes are returned as a Blob. On failure, error is a
// FunctionsHttpError (function returned non-2xx — status/body are on
// error.context, not interpreted here), FunctionsRelayError, or
// FunctionsFetchError — every case is mapped by the caller.
//
// Why direct fetch, not supabase.functions.invoke: @supabase/functions-js
// at the installed version decodes any response whose Content-Type is
// outside its explicit binary list (only application/octet-stream and
// application/pdf) with response.text(), which UTF-8-decodes binary bytes
// and corrupts image/* evidence (verified live, QA-05). Direct fetch with
// response.blob() preserves exact bytes. Request contract is otherwise
// unchanged: same URL, method, body, apikey, and Authorization bearer.
// The functional security contract (submission_id → live authorization →
// DB-derived path → bytes) is untouched; X-Client-Info is a telemetry-only
// label and is intentionally omitted from the direct-fetch headers.
//
// Public API has no caller-controllable fields: endpoint URL, apikey, and
// Authorization bearer are all resolved from the module-level supabase
// client / supabaseConfig. A screen cannot substitute any of them.
export async function fetchTaskCompletionEvidence(
  submissionId: string,
): Promise<EdgeFunctionResult<Blob>> {
  if (!supabase) return { data: null, error: notConfiguredError() };
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? supabaseKey;
  return fetchEvidenceWithTransport(submissionId, {
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
  transport: {
    endpointUrl: string;
    apiKey:      string;
    bearerToken: string;
    fetchFn:     typeof fetch;
  },
): Promise<EdgeFunctionResult<Blob>> {
  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey:         transport.apiKey,
      Authorization:  `Bearer ${transport.bearerToken}`,
    },
    body: JSON.stringify({ submission_id: submissionId }),
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
  // runtime-specific Response.blob() errors). Route such a failure through
  // the same existing repository error contract rather than escaping as an
  // uncaught exception. FunctionsFetchError is the closest existing
  // classification: installed @supabase/functions-js (verified against its
  // own types.ts) carries FunctionsFetchError for every rejection raised
  // "before/during request OR while receiving the body" when wrapping
  // fetch, and does not define a separate body-consumption class.
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (bodyError) {
    return { data: null, error: new FunctionsFetchError(bodyError) };
  }
  return { data: blob, error: null };
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

// Uploads already-normalized evidence bytes (the caller has already
// re-wrapped the Blob with the correct, picker-provided MIME type — see
// features/tasks/requestTaskCompletionWithEvidence.ts) to the
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
export async function uploadTaskCompletionEvidence(input: {
  path: string;
  blob: Blob;
}): Promise<StorageUploadResult<{ path: string }>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.storage
    .from('task-completion-evidence')
    .upload(input.path, input.blob, { upsert: false });

  if (error) return { data: null, error };
  return { data: { path: data.path }, error: null };
}

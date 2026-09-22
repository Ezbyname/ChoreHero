import type {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  PostgrestError,
} from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
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
export async function fetchTaskCompletionEvidence(
  submissionId: string,
): Promise<EdgeFunctionResult<Blob>> {
  if (!supabase) return { data: null, error: notConfiguredError() };

  const { data, error } = await supabase.functions.invoke<Blob>('task-completion-evidence', {
    body: { submission_id: submissionId },
  });
  if (error || !data) return { data: null, error: error ?? notConfiguredError() };
  return { data, error: null };
}

// Task Completion Photo Proof — live authorization proxy for evidence reads.
//
// Why this exists: Supabase Storage's Smart CDN caches private-bucket object
// responses per (user, object) and does NOT invalidate that cache when the
// user's authorization changes later — only object update/delete does (see
// the accompanying architecture review). A direct Storage URL (signed or
// authenticated) is therefore unsafe for this feature: a household member
// who lost access could keep receiving a cached response indefinitely. This
// function is the only sanctioned read path for evidence bytes — it forces
// a live authorization check on every single request, with no caching layer
// in front of the decision.
//
// Deliberately portable (no Deno-only globals) so it can be unit tested with
// this repo's existing Node-based test runner. supabase/functions/*/index.ts
// is the thin Deno entry point that wires this up to the real runtime — see
// that file's own header comment. Do not add business logic to index.ts.
//
// Confused-deputy prevention: the client sends ONLY submission_id (plus,
// for photos 2..5 of a multi-photo submission, a small integer photo_index),
// never a storage path. The path used for the privileged Storage read is
// taken exclusively from server-side rows: photo 1 from the row returned by
// the caller-scoped authorization query, photos 2..5 from
// task_completion_submission_photos keyed by THAT authorized row's id and
// the validated index — there is no code path through which client input
// reaches the admin Storage call as a path.
import type { SupabaseClient } from '@supabase/supabase-js';

const EVIDENCE_BUCKET = 'task-completion-evidence';
// Photos 2..5 (positions 1..4); see 20261030000000_task_completion_multi_photo.sql.
const EXTRA_PHOTOS_TABLE = 'task_completion_submission_photos';
const MAX_PHOTO_INDEX = 4;

// Applied to every response this handler produces, success or failure.
// Vary: Authorization — this response depends on who's asking, never share
// a cached copy across different callers' Authorization headers, even
// though nothing in front of this function is expected to cache at all;
// stating it explicitly costs nothing and doesn't rely on that expectation
// holding. X-Content-Type-Options: nosniff — the browser/client must never
// MIME-sniff evidence bytes into something else.
const COMMON_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
} as const;

function jsonResponse(status: number, errorCode: string): Response {
  return new Response(JSON.stringify({ error: errorCode }), {
    status,
    headers: { 'Content-Type': 'application/json', ...COMMON_HEADERS },
  });
}

// Not-found (row doesn't exist) and not-visible (RLS hides it, or a
// visible-but-photo-less submission) are deliberately indistinguishable —
// the same no-existence-oracle discipline already applied to every other
// authorization boundary in this codebase (see e.g. approve_task_completion_v2's
// collapsed "nonexistent vs unauthorized" 28000, or claim_open_task's own
// generic-message convention).
const notFound = () => jsonResponse(404, 'not_found');
const badRequest = (code: string) => jsonResponse(400, code);
const methodNotAllowed = () => jsonResponse(405, 'method_not_allowed');
const serverError = () => jsonResponse(500, 'internal_error');

// General UUID shape, not narrowed to version 4 specifically — matches the
// leniency already used elsewhere in this codebase's own UUID validation.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EvidenceHandlerContext {
  // RLS-scoped to the calling user's own JWT — the ONLY client ever used to
  // decide whether this request is authorized. Its result is trusted
  // completely: this function does not re-derive household/role logic in
  // TypeScript. task_completion_submissions_select_self_or_adult_plus
  // (20260906000000, already QA-verified) remains the single source of
  // truth for "who can see this submission."
  supabase: SupabaseClient;
  // service-role — bypasses RLS. Used ONLY after the authorization query
  // above has already succeeded: to resolve an extra photo's path for that
  // authorized submission (clients have no access to
  // task_completion_submission_photos at all), and to read the object.
  // Never used for the authorization decision itself.
  supabaseAdmin: SupabaseClient;
}

export async function handleTaskCompletionEvidenceRequest(
  req: Request,
  ctx: EvidenceHandlerContext,
): Promise<Response> {
  if (req.method !== 'POST') {
    return methodNotAllowed();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('invalid_json');
  }

  if (typeof body !== 'object' || body === null) {
    return badRequest('missing_submission_id');
  }

  // Strict contract: the ONLY valid body is { submission_id }. Any
  // additional top-level property — e.g. a client-supplied
  // photo_storage_path — is rejected outright, before either the
  // caller-scoped authorization query or the admin Storage read is ever
  // reached. Silently ignoring an extra field is not the same guarantee as
  // rejecting it: ignoring still parses and processes attacker-controlled
  // input as far as this validation step, leaving room for a future change
  // to accidentally start reading it. Rejecting closes that off entirely.
  //
  // photo_index (0-based, optional, default 0) is the only other accepted
  // field. It is an index, never a path, and is validated as an integer in
  // [0, MAX_PHOTO_INDEX] before anything else happens.
  const bodyKeys = Object.keys(body as Record<string, unknown>);
  if (
    !bodyKeys.includes('submission_id') ||
    bodyKeys.some((k) => k !== 'submission_id' && k !== 'photo_index')
  ) {
    return badRequest('unexpected_fields');
  }

  const submissionId = (body as Record<string, unknown>).submission_id;
  if (typeof submissionId !== 'string' || !UUID_PATTERN.test(submissionId)) {
    return badRequest('invalid_submission_id');
  }

  const rawIndex = (body as Record<string, unknown>).photo_index;
  const photoIndex = rawIndex === undefined ? 0 : rawIndex;
  if (
    typeof photoIndex !== 'number' ||
    !Number.isInteger(photoIndex) ||
    photoIndex < 0 ||
    photoIndex > MAX_PHOTO_INDEX
  ) {
    return badRequest('invalid_photo_index');
  }

  // Live authorization gate. Selects only the fields actually needed.
  // Any other field the client may have sent (e.g. a rogue
  // photo_storage_path) is never read — see the header comment.
  const { data: submission, error: selectError } = await ctx.supabase
    .from('task_completion_submissions')
    .select('id, photo_storage_path')
    .eq('id', submissionId)
    .maybeSingle();

  if (selectError) {
    return serverError();
  }

  if (!submission || !submission.photo_storage_path) {
    return notFound();
  }

  // Photo 1 is the authorized row's own path. Photos 2..5 are resolved for
  // THAT authorized submission id only; a missing position is the same
  // not-found as an invisible submission.
  let path: string = submission.photo_storage_path;
  if (photoIndex > 0) {
    const { data: extra, error: extraError } = await ctx.supabaseAdmin
      .from(EXTRA_PHOTOS_TABLE)
      .select('storage_path')
      .eq('submission_id', submission.id)
      .eq('position', photoIndex)
      .maybeSingle();
    if (extraError) return serverError();
    if (!extra || !extra.storage_path) return notFound();
    path = extra.storage_path;
  }

  // Privileged read — reached ONLY after the caller-scoped query above
  // succeeded, using exclusively a server-derived path.
  const { data: blob, error: downloadError } = await ctx.supabaseAdmin.storage
    .from(EVIDENCE_BUCKET)
    .download(path);

  if (downloadError || !blob) {
    return serverError();
  }

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      ...COMMON_HEADERS,
    },
  });
}

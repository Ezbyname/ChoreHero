-- Task Completion Photo Proof — Slice 3: Storage bucket + policies for
-- task-completion-evidence.
--
-- Scope: Storage only. Does not touch public.tasks, task_completion_submissions,
-- or any of the Slice 2B functions (request_task_completion_v2,
-- approve_task_completion_v2, reject_task_completion_v2, request_task_completion).
-- Named and required by Slice 2B's own header comment
-- (20260910000000_task_completion_v2_and_task_governance.sql:135-141): until
-- this bucket exists, any non-NULL p_photo_object_id deterministically raises
-- CH015 — that behavior is unchanged by this migration; this migration only
-- makes a real evidence object attachable for the first time.
--
-- IMPORTANT — testing limitation (same as 20260708000000_avatar_storage.sql):
-- storage.objects/storage.buckets/storage.foldername() are part of Supabase's
-- platform-managed Storage extension, not available in a vanilla Postgres
-- instance the way auth.uid() can be mocked for app-schema RLS migrations.
-- This migration is syntax-valid and written to the same conventions already
-- applied and QA-verified for the avatars bucket, but has not been validated
-- against a real Postgres instance — it needs its own live-QA pass before
-- being trusted, same as avatars needed one.
--
-- ============================================================
-- Path convention (fixed by request_task_completion_v2, not by this file)
-- ============================================================
-- {household_id}/{task_id}/{submitted_by_profile_id}/{photo_object_id}
-- — exactly the formula request_task_completion_v2 already builds
-- (v_task.household_id || '/' || p_task_id || '/' || v_caller || '/' ||
-- p_photo_object_id). storage.foldername(name) returns every path segment
-- EXCEPT the final one (Supabase's own definition: string_to_array(name,'/')
-- with the last element dropped) — so for this 4-segment path it returns
-- exactly 3 elements: [household_id, task_id, submitted_by_profile_id].
-- photo_object_id is the object's own final "filename" segment, not part of
-- foldername()'s output. Enforcing array_length(...) = 3 below is therefore
-- what rejects any extra intermediate folder level.
--
-- ============================================================
-- Private bucket — unlike avatars — with fail-closed idempotent creation
-- ============================================================
-- avatars is public:true because a profile picture is meant to be visible
-- household-wide via a plain CDN URL, bypassing RLS entirely for reads.
-- Evidence photos are not: private family content, visible only via the
-- submission-backed SELECT policy below. public must be false.
--
-- CORRECTION from the first draft of this migration: a plain
-- `INSERT ... ON CONFLICT (id) DO NOTHING` does not actually guarantee
-- public = false — if a bucket with this id already existed (e.g. created
-- manually, out of band) with public = true, DO NOTHING would silently
-- leave it public. The DO block below instead fails loudly (RAISE
-- EXCEPTION, aborting this migration's transaction) if a pre-existing
-- bucket's configuration doesn't match the required contract, rather than
-- ever silently tolerating or silently coercing an unexpected prior state —
-- consistent with this codebase's established migration-application
-- discipline (compare-and-decide, never blind-apply) rather than
-- reconciling it automatically, since these migrations are meant to be
-- one-shot and auditable, not self-healing.
-- file_size_limit / allowed_mime_types below are an EXPLICIT product/security
-- decision made now, not something derived from any existing repository
-- contract — no precedent for either value exists anywhere in this codebase
-- (neither the avatars bucket, 20260708000000_avatar_storage.sql, nor
-- src/screens/ProfileSetupScreen.tsx's picker, which only restricts
-- mediaTypes: ['images'] with no size cap, define one). Recorded here, not
-- silently attributed to prior art.
DO $$
DECLARE
  v_bucket           storage.buckets%ROWTYPE;
  v_file_size_limit  bigint  := 20971520; -- 20 MiB = 20 * 1024 * 1024 bytes
  v_allowed_mime_types text[] := ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'
  ];
BEGIN
  SELECT * INTO v_bucket FROM storage.buckets WHERE id = 'task-completion-evidence';

  IF NOT FOUND THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'task-completion-evidence', 'task-completion-evidence', false,
      v_file_size_limit, v_allowed_mime_types
    );
  ELSIF v_bucket.public IS DISTINCT FROM false
     OR v_bucket.file_size_limit IS DISTINCT FROM v_file_size_limit
     OR v_bucket.allowed_mime_types IS DISTINCT FROM v_allowed_mime_types THEN
    RAISE EXCEPTION
      'task-completion-evidence bucket already exists with a configuration that does not match the required contract (public=false, file_size_limit=%, allowed_mime_types=%) — found public=%, file_size_limit=%, allowed_mime_types=%. Resolve manually (this migration will not silently coerce it) before re-applying.',
      v_file_size_limit, v_allowed_mime_types,
      v_bucket.public, v_bucket.file_size_limit, v_bucket.allowed_mime_types;
  END IF;
END $$;

-- ============================================================
-- INSERT policy — tied to a real, currently-open, currently-assigned task
-- ============================================================
-- CORRECTION from the first draft: the original policy only checked
-- household membership (segment 1) and the caller's own uid (segment 3),
-- which let any current household member upload an object under an
-- arbitrary task_id (segment 2) belonging to that household — real/nonexistent,
-- theirs or not, open or already completed — creating unlimited orphaned
-- objects. request_task_completion_v2 would still refuse to ever attach such
-- an object to a submission, but the Storage-level abuse/orphan-accumulation
-- surface was real and worth closing here, not just downstream.
--
-- Tightened to require the referenced task actually exists, its
-- household_id matches segment 1, its assignee_profile_id is the caller
-- (not merely "a member" of the household), and it is currently 'open'.
-- This makes internal.is_household_member redundant here (the assignee of
-- any task is, by the existing task/assignment invariants this repository
-- already enforces elsewhere — see 20260910000000's tasks_insert_adult_plus
-- WITH CHECK — always a member of that task's household) so it is not
-- referenced. Deliberately does NOT also check household-member role
-- (e.g. 'child'): matching the caller to the task's actual current assignee
-- already narrows this to exactly the same population
-- request_task_completion_v2's own CREATE-authorization branch would ever
-- accept, without duplicating that role check a second time in a different
-- layer.
--
-- status = 'open' matches the only currently-legitimate upload timing: the
-- client always uploads evidence BEFORE calling request_task_completion_v2
-- (whose own CH015 check requires the object to already exist), and no
-- client code exists yet anywhere in this repository for this flow. If a
-- future retry/resilience design needs to re-upload while a task is already
-- 'needs_attention' (e.g. an idempotent retry after a dropped RPC
-- response), this predicate will need revisiting then, against that actual
-- design — not guessed at now.
CREATE POLICY task_completion_evidence_insert_own_open_assigned_task
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'task-completion-evidence'
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[3] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = ((storage.foldername(name))[2])::uuid
      AND t.household_id = ((storage.foldername(name))[1])::uuid
      AND t.assignee_profile_id = auth.uid()
      AND t.status = 'open'
  )
);
-- Note, unchanged from the first draft: casting segments 1/2 to uuid raises
-- a plain Postgres error (not a clean RLS-style rejection) if the path is
-- malformed. Still an accepted failure mode — it still fails closed — since
-- this app never constructs a malformed path itself; only a malicious/buggy
-- caller could trigger it.

-- ============================================================
-- SELECT policy — submission-backed, reused not reimplemented
-- ============================================================
-- Unchanged in design from the first draft (approved) — schema-qualified
-- per review. Deliberately does NOT re-derive "who can see this" from
-- household role logic directly. Instead it relies entirely on
-- task_completion_submissions_select_self_or_adult_plus (already
-- QA-verified, 20260906000000) via a cross-table EXISTS keyed on
-- photo_storage_path = name: if that row is visible to the calling
-- authenticated user under its own existing policy, the evidence object tied
-- to it is visible too; if not, it isn't. Single source of truth for "who
-- can see this submission" stays in one place. authenticated already holds
-- table-level SELECT on task_completion_submissions
-- (20260906000000_task_completion_submissions_schema.sql:137), so this
-- subquery is evaluated under that table's real RLS, not bypassed.
CREATE POLICY task_completion_evidence_select_submission_backed
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'task-completion-evidence'
  AND EXISTS (
    SELECT 1
    FROM public.task_completion_submissions tcs
    WHERE tcs.photo_storage_path = storage.objects.name
  )
);

-- ============================================================
-- No UPDATE/DELETE policy — unchanged from the first draft
-- ============================================================
-- Evidence is immutable once attached — Slice 1's own header comment
-- (20260906000000_task_completion_submissions_schema.sql:48-51): "a rejected
-- attempt's immutable evidence must not later be attached directly to a
-- different attempt." No shipped or planned feature mutates or removes an
-- evidence object after upload. RLS default-deny handles both operations;
-- no policy is added for either.
--
-- Migration history rule: do not edit this file after it is applied.

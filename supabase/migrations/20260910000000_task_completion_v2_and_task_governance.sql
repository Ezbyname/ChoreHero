-- Task Completion Photo Proof — Slice 2B: v2 workflow RPCs, legacy v1
-- request coexistence guard, and public.tasks privilege/RLS governance.
--
-- Scope: this migration is DB-only. No TypeScript, no client dispatch, no
-- Storage bucket, no UI. It creates request_task_completion_v2,
-- approve_task_completion_v2, reject_task_completion_v2; CREATE OR
-- REPLACEs the legacy request_task_completion(uuid) to add a CH020
-- coexistence guard; and hardens public.tasks' table-level privileges and
-- its tasks_insert_adult_plus RLS policy. It does not touch Slice 1's
-- schema (20260906000000) or Slice 2A's migration
-- (20260906010000/20260906010000-anon-fix, already live and QA-verified)
-- in any way.
--
-- This is the outcome of a long, multi-round design review (task-first
-- locking; idempotency; CH014/CH015/CH017/CH018/CH019/CH020 semantics;
-- authorization secrecy; a live QA ACL preflight against public.tasks;
-- and a full repository-wide direct-mutation audit) — every design
-- decision embedded below has already been reviewed and approved; this
-- migration is the mechanical translation of that review into SQL, not a
-- new design pass.
--
-- ============================================================
-- Lock-order rule (global, this slice and Slice 2A)
-- ============================================================
-- The task row is the FIRST row lock acquired by every function in this
-- workflow. Read-only, unlocked lookups (idempotency-key routing,
-- existence/authorization context) may still happen before that lock —
-- "first lock acquired" is not "first read performed." The review RPCs
-- lock task, then submission, never the reverse — no function anywhere in
-- this workflow acquires these two locks out of order, so no deadlock
-- cycle between request_task_completion_v2, approve_task_completion_v2,
-- reject_task_completion_v2, and the legacy v1 functions is possible.
--
-- ============================================================
-- CH014 task-existence oracle — why the routing lookup comes first
-- ============================================================
-- request_task_completion_v2 performs an UNLOCKED lookup by
-- (submitted_by_profile_id, client_request_id) BEFORE ever touching
-- p_task_id. If that lookup finds a row belonging to a DIFFERENT task,
-- CH014 is raised immediately and p_task_id is never queried at all —
-- this is deliberate: without this ordering, a caller holding one stale
-- idempotency key could distinguish "this task UUID doesn't exist" (which
-- would otherwise take a different path than "this task UUID exists in a
-- household I can't touch") by whether they get a generic 28000 or a
-- specific CH014, which would leak cross-household task existence. Because
-- the cross-task branch never queries `tasks` at all, no such signal can
-- exist. Only when the routing lookup finds nothing, or finds a row that
-- already belongs to the requested task, does the function proceed to
-- lock and examine p_task_id — and even then, "task not found" and "task
-- exists but caller unauthorized" are collapsed into the identical 28000
-- code and message.
--
-- ============================================================
-- Replay vs. create authorization — two distinct gates
-- ============================================================
-- Authorization to CREATE a new attempt (current household child AND
-- current task assignee) is a different permission than authorization to
-- RECEIVE an already-existing idempotent replay result. The replay gate
-- uses current household membership only, ANY role — mirroring Slice 1's
-- own already-shipped SELECT RLS policy on task_completion_submissions
-- exactly (a submitter keeps read access to their own historical
-- submission for as long as they remain a current household member,
-- regardless of role). The idempotency lookup itself can never leak
-- another caller's data — it is scoped to submitted_by_profile_id =
-- auth.uid(), so every row it can possibly find was created by the
-- caller themselves.
--
-- ============================================================
-- Household integrity invariant
-- ============================================================
-- task_completion_submissions.household_id must always equal
-- tasks.household_id for the task it references. request_v2 satisfies
-- this by construction on every row it creates (household_id is derived
-- from the locked task, never client-supplied). The review RPCs and
-- request_v2's own replay path defensively re-verify it on every
-- pre-existing row they read, because they trust persisted data rather
-- than constructing it themselves — a mismatch is a CH019 workflow
-- invariant violation, full rollback, not a normal client-facing outcome.
--
-- ============================================================
-- Points / ledger contract (approve_task_completion_v2)
-- ============================================================
-- Mirrors the current authoritative legacy approve_task_completion body
-- (20260816000000_award_task_completion_points.sql, unchanged by this
-- migration) exactly: the awarded amount is tasks.points as returned by
-- the task's OWN successful CAS (needs_attention -> completed), not a
-- value read or cached earlier. completed_by_profile_id and the points
-- recipient are both submission.submitted_by_profile_id — the historical
-- record of who actually did the work and submitted evidence for this
-- specific attempt — not tasks.assignee_profile_id, so a future task
-- reassignment (which today has no implemented path at all — see the
-- task ACL hardening below) can never misattribute credit for an
-- already-pending attempt. The points block is reached only after BOTH
-- the submission CAS and the task CAS have succeeded, in that order, so a
-- replay, a concurrent CAS loser, an already-terminal submission (CH017),
-- an authorization failure, or a CH019 invariant abort can never award
-- points or insert a ledger row. There is no second uniqueness constraint
-- on point_transactions beyond the task's own status CAS (confirmed:
-- point_transactions carries no UNIQUE constraint at all) — exactly the
-- same accepted risk profile the legacy RPC already operates under; this
-- migration does not hold v2 to a stricter standard than legacy.
--
-- ============================================================
-- unique_violation disambiguation — positive re-derivation only
-- ============================================================
-- request_task_completion_v2's INSERT exception handler re-derives each
-- known business collision from actual persisted state — re-running the
-- idempotency lookup for CH014, an EXISTS check against the one-pending-
-- per-task partial index for CH019, and an EXISTS check against the
-- expected photo_storage_path for CH018 — never by eliminating the first
-- two and assuming CH018 by default. Any unique_violation that matches
-- none of the three known causes is re-raised unchanged (bare RAISE;)
-- rather than mislabeled as a business error.
--
-- ============================================================
-- CH020 — legacy v1 request coexistence guard
-- ============================================================
-- Once ANY task_completion_submissions row exists for a task (pending or
-- terminal), legacy request_task_completion may never create a new
-- attempt for it again — a one-way door, forcing every subsequent attempt
-- through the v2 workflow so the historical-attempt record this feature
-- exists to build is never silently gapped by a v1 fallback. The guard
-- follows the exact same shape Slice 2A already established and QA-
-- verified for the legacy REVIEW functions: unlocked read + first
-- authorization check, FOR UPDATE re-lock (first lock in the workflow),
-- defensive NOT FOUND, authorization re-checked against the locked row,
-- THEN the new coexistence check, THEN the existing CAS — unchanged
-- behavior for every task with no submission history (a provable no-op
-- until this migration's own request_task_completion_v2 can create the
-- first such row).
--
-- ============================================================
-- Evidence / Storage boundary
-- ============================================================
-- request_task_completion_v2's evidence check references bucket_id =
-- 'task-completion-evidence' in storage.objects. That bucket does not
-- exist yet — Slice 3 is responsible for creating it (with exactly this
-- id) and its policies. Until then, any call supplying a non-NULL
-- p_photo_object_id deterministically raises CH015 (object not found) —
-- an intended, documented consequence, not a defect. NULL-evidence calls
-- are fully functional today and do not depend on Slice 3 at all.
--
-- ============================================================
-- public.tasks privilege/RLS governance
-- ============================================================
-- A live QA preflight (pg_class.relacl / information_schema
-- .table_privileges / has_table_privilege / has_column_privilege, run
-- immediately before this migration was written) established that
-- public.tasks had NEVER had any GRANT/REVOKE applied to it in this
-- repository's history. The preflight confirmed broad explicit table
-- privileges (arwdDxtm — SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER, plus MAINTAIN where applicable) for anon,
-- authenticated, and service_role, and observed the same for the table
-- owner/postgres baseline. PUBLIC's own effective privileges were not
-- independently confirmed by the preflight; PUBLIC is nonetheless
-- revoked defensively below as part of the deterministic least-privilege
-- target this migration establishes, regardless of whatever its prior
-- effective state actually was. pg_attribute.attacl returned zero rows
-- (no pre-existing column-level overrides to reconcile). A repository-wide
-- audit (every file, every
-- extension, src/supabase/scripts/tests, not just one directory or one
-- source pattern) confirmed there is exactly one legitimate direct
-- mutation of tasks anywhere in this codebase — insertTask()
-- (src/lib/repositories/tasks.ts), which never sends status, completed_at,
-- completed_by_profile_id, or source_service_request_id — and zero direct
-- UPDATEs anywhere, ever. Every other task mutation already goes through
-- a SECURITY DEFINER RPC. Without this hardening, an authenticated
-- owner/admin/adult could bypass every RPC and every invariant this and
-- the previous slice depend on via a single direct INSERT or UPDATE
-- (e.g. status = 'completed' with a fabricated completed_by_profile_id,
-- while a v2 submission is still pending) — the workflow-invariant claims
-- this whole design makes were not actually DB-enforced until this block.
--
-- Migration history rule: do not edit this file after it is applied.

-- ============================================================
-- request_task_completion_v2
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_task_completion_v2(
  p_task_id            uuid,
  p_client_request_id  uuid,
  p_photo_object_id    uuid DEFAULT NULL
)
RETURNS public.task_completion_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller           uuid := auth.uid();
  v_task             tasks%ROWTYPE;
  v_candidate        task_completion_submissions%ROWTYPE;
  v_candidate_found  boolean := false;
  v_existing         task_completion_submissions%ROWTYPE;
  v_expected_path    text;
  v_submission       task_completion_submissions%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Unlocked routing lookup only — no lock, no mutation, no return yet.
  -- p_task_id is not referenced anywhere in this step.
  SELECT * INTO v_candidate
  FROM task_completion_submissions
  WHERE submitted_by_profile_id = v_caller
    AND client_request_id = p_client_request_id;
  v_candidate_found := FOUND;

  IF v_candidate_found AND v_candidate.task_id <> p_task_id THEN
    -- p_task_id is NEVER looked up in this branch — see this migration's
    -- header comment for the CH014 no-oracle guarantee this enforces.
    RAISE EXCEPTION 'client_request_id already used for a different task' USING ERRCODE = 'CH014';
  END IF;

  -- First and only lock acquisition point in this function. Reached only
  -- when there is no colliding key, or the colliding key already belongs
  -- to this exact task.
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    -- Collapsed with every authorization failure below — see header.
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '28000';
  END IF;

  v_expected_path := CASE
    WHEN p_photo_object_id IS NULL THEN NULL
    ELSE v_task.household_id || '/' || p_task_id || '/' || v_caller || '/' || p_photo_object_id
  END;

  IF v_candidate_found THEN
    -- REPLAY branch — v_candidate.task_id = p_task_id is guaranteed by
    -- the exit above.
    SELECT * INTO v_existing FROM task_completion_submissions WHERE id = v_candidate.id;

    -- Defensive re-validation of the re-read itself: no client-reachable
    -- path can change task_id after insert, so this is not an expected
    -- race — but since this is already a defensive re-read of persisted
    -- data, it must be completed, not partial. NOT FOUND (the row
    -- disappearing, which cannot legitimately happen — no DELETE path
    -- exists on this table) and a task_id mismatch are both treated as
    -- CH019, not CH014: the earlier routing lookup already established
    -- that this key belongs to the requested task, so a mismatch here
    -- would mean persisted-workflow corruption, not ordinary incompatible
    -- key reuse.
    IF NOT FOUND OR v_existing.task_id IS DISTINCT FROM p_task_id THEN
      RAISE EXCEPTION 'Workflow invariant violated: replay submission/task mismatch' USING ERRCODE = 'CH019';
    END IF;

    IF v_existing.household_id IS DISTINCT FROM v_task.household_id THEN
      RAISE EXCEPTION 'Workflow invariant violated: submission/task household mismatch' USING ERRCODE = 'CH019';
    END IF;

    -- RECEIVE authorization: current household membership, ANY role —
    -- distinct from CREATE authorization below. See header comment.
    IF NOT internal.is_household_member(v_task.household_id, v_caller) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '28000';
    END IF;

    IF v_expected_path IS DISTINCT FROM v_existing.photo_storage_path THEN
      RAISE EXCEPTION 'client_request_id reused with different evidence' USING ERRCODE = 'CH014';
    END IF;

    RETURN v_existing;
  END IF;

  -- CREATE branch — no candidate existed at the routing lookup.
  IF NOT internal.is_household_member(
    v_task.household_id, v_caller, ARRAY['child']::household_member_role[]
  ) OR v_task.assignee_profile_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '28000';
  END IF;

  -- Second idempotency lookup, now under the lock and after CREATE
  -- authorization has already passed — closes the race where an
  -- identical concurrent retry (or a genuine cross-task collision)
  -- committed between the first lookup and this lock's acquisition.
  SELECT * INTO v_existing
  FROM task_completion_submissions
  WHERE submitted_by_profile_id = v_caller
    AND client_request_id = p_client_request_id;

  IF FOUND THEN
    IF v_existing.task_id <> p_task_id THEN
      RAISE EXCEPTION 'client_request_id already used for a different task' USING ERRCODE = 'CH014';
    END IF;
    IF v_existing.household_id IS DISTINCT FROM v_task.household_id THEN
      RAISE EXCEPTION 'Workflow invariant violated: submission/task household mismatch' USING ERRCODE = 'CH019';
    END IF;
    IF v_expected_path IS DISTINCT FROM v_existing.photo_storage_path THEN
      RAISE EXCEPTION 'client_request_id reused with different evidence' USING ERRCODE = 'CH014';
    END IF;
    RETURN v_existing;
  END IF;

  UPDATE tasks
  SET status = 'needs_attention'
  WHERE id = p_task_id
    AND status = 'open'
  RETURNING * INTO v_task;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task is not open' USING ERRCODE = 'CH003';
  END IF;

  IF p_photo_object_id IS NOT NULL THEN
    -- See header comment: bucket 'task-completion-evidence' does not
    -- exist until Slice 3 — until then this always raises CH015.
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'task-completion-evidence'
        AND name = v_expected_path
    ) THEN
      RAISE EXCEPTION 'Evidence object not found' USING ERRCODE = 'CH015';
    END IF;
  END IF;

  BEGIN
    INSERT INTO task_completion_submissions
      (task_id, household_id, submitted_by_profile_id, client_request_id,
       photo_storage_path, status)
    VALUES
      (p_task_id, v_task.household_id, v_caller, p_client_request_id,
       v_expected_path, 'pending')
    RETURNING * INTO v_submission;
  EXCEPTION WHEN unique_violation THEN
    -- Positive re-derivation from persisted state only — see header.
    SELECT * INTO v_existing
    FROM task_completion_submissions
    WHERE submitted_by_profile_id = v_caller
      AND client_request_id = p_client_request_id;

    IF FOUND THEN
      IF v_existing.task_id <> p_task_id THEN
        RAISE EXCEPTION 'client_request_id already used for a different task' USING ERRCODE = 'CH014';
      END IF;

      -- Household integrity invariant, defensive on persisted data — same
      -- check as the normal replay path and the post-lock second lookup
      -- above. IS DISTINCT FROM (not <>) so this also fails closed on a
      -- NULL household_id rather than silently passing.
      IF v_existing.household_id IS DISTINCT FROM v_task.household_id THEN
        RAISE EXCEPTION 'Workflow invariant violated: submission/task household mismatch' USING ERRCODE = 'CH019';
      END IF;

      IF v_expected_path IS DISTINCT FROM v_existing.photo_storage_path THEN
        RAISE EXCEPTION 'client_request_id reused with different evidence' USING ERRCODE = 'CH014';
      ELSE
        RETURN v_existing;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM task_completion_submissions
      WHERE task_id = p_task_id AND status = 'pending'
    ) THEN
      RAISE EXCEPTION 'Workflow invariant violated: unexpected pending submission' USING ERRCODE = 'CH019';
    END IF;

    IF v_expected_path IS NOT NULL AND EXISTS (
      SELECT 1 FROM task_completion_submissions WHERE photo_storage_path = v_expected_path
    ) THEN
      RAISE EXCEPTION 'Evidence object already attached to another submission' USING ERRCODE = 'CH018';
    END IF;

    -- Unrecognized cause — never misclassify. Re-raise unchanged.
    RAISE;
  END;

  RETURN v_submission;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_task_completion_v2(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_task_completion_v2(uuid, uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.request_task_completion_v2(uuid, uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.request_task_completion_v2(uuid, uuid, uuid) TO service_role;

-- ============================================================
-- approve_task_completion_v2
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_task_completion_v2(p_submission_id uuid)
RETURNS public.task_completion_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_task_id      uuid;
  v_household_id uuid;
  v_task         tasks%ROWTYPE;
  v_submission   task_completion_submissions%ROWTYPE;
  v_new_balance  integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Minimal-field lookup only — loaded internally for authorization, not
  -- yet revealed externally. See this migration's header comment.
  SELECT task_id, household_id INTO v_task_id, v_household_id
  FROM task_completion_submissions
  WHERE id = p_submission_id;

  IF NOT FOUND OR NOT internal.is_household_member(
    v_household_id, v_caller, ARRAY['owner','admin','adult']::household_member_role[]
  ) THEN
    -- Nonexistent submission and "exists but caller unauthorized for its
    -- household" are deliberately indistinguishable.
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '28000';
  END IF;

  -- First lock: task, per the global task-first rule.
  SELECT * INTO v_task FROM tasks WHERE id = v_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow invariant violated: referenced task missing' USING ERRCODE = 'CH019';
  END IF;

  IF NOT internal.is_household_member(
    v_task.household_id, v_caller, ARRAY['owner','admin','adult']::household_member_role[]
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '28000';
  END IF;

  -- Second lock: submission.
  SELECT * INTO v_submission FROM task_completion_submissions WHERE id = p_submission_id FOR UPDATE;

  IF v_submission.household_id IS DISTINCT FROM v_task.household_id THEN
    RAISE EXCEPTION 'Workflow invariant violated: submission/task household mismatch' USING ERRCODE = 'CH019';
  END IF;

  IF v_submission.task_id <> v_task_id OR v_submission.status <> 'pending' THEN
    -- Safe to be specific here — caller is already fully authorized.
    RAISE EXCEPTION 'Submission is not pending review' USING ERRCODE = 'CH017';
  END IF;

  UPDATE task_completion_submissions
  SET status                 = 'approved',
      reviewed_by_profile_id = v_caller,
      reviewed_at            = now(),
      updated_at             = now()
  WHERE id = p_submission_id AND status = 'pending'
  RETURNING * INTO v_submission;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission is not pending review' USING ERRCODE = 'CH017';
  END IF;

  UPDATE tasks
  SET status                  = 'completed',
      completed_at            = now(),
      completed_by_profile_id = v_submission.submitted_by_profile_id
  WHERE id = v_task_id AND status = 'needs_attention'
  RETURNING * INTO v_task;

  IF NOT FOUND THEN
    -- C7: submission CAS already succeeded above but the task CAS just
    -- failed — abort here rolls back that submission CAS too, since
    -- nothing in this function commits until it returns successfully.
    RAISE EXCEPTION 'Workflow invariant violated: task/submission transition mismatch' USING ERRCODE = 'CH019';
  END IF;

  INSERT INTO points_balances (household_id, profile_id, balance)
  VALUES (v_task.household_id, v_submission.submitted_by_profile_id, v_task.points)
  ON CONFLICT ON CONSTRAINT uq_points_balances_household_profile
  DO UPDATE SET balance = points_balances.balance + EXCLUDED.balance,
                updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO point_transactions
    (household_id, profile_id, type, amount, balance_after, task_id, created_by_profile_id)
  VALUES
    (v_task.household_id, v_submission.submitted_by_profile_id, 'task_completed',
     v_task.points, v_new_balance, v_task.id, v_caller);

  RETURN v_submission;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_task_completion_v2(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_task_completion_v2(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.approve_task_completion_v2(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.approve_task_completion_v2(uuid) TO service_role;

-- ============================================================
-- reject_task_completion_v2
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_task_completion_v2(p_submission_id uuid)
RETURNS public.task_completion_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_task_id      uuid;
  v_household_id uuid;
  v_task         tasks%ROWTYPE;
  v_submission   task_completion_submissions%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT task_id, household_id INTO v_task_id, v_household_id
  FROM task_completion_submissions
  WHERE id = p_submission_id;

  IF NOT FOUND OR NOT internal.is_household_member(
    v_household_id, v_caller, ARRAY['owner','admin','adult']::household_member_role[]
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = v_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow invariant violated: referenced task missing' USING ERRCODE = 'CH019';
  END IF;

  IF NOT internal.is_household_member(
    v_task.household_id, v_caller, ARRAY['owner','admin','adult']::household_member_role[]
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_submission FROM task_completion_submissions WHERE id = p_submission_id FOR UPDATE;

  IF v_submission.household_id IS DISTINCT FROM v_task.household_id THEN
    RAISE EXCEPTION 'Workflow invariant violated: submission/task household mismatch' USING ERRCODE = 'CH019';
  END IF;

  IF v_submission.task_id <> v_task_id OR v_submission.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission is not pending review' USING ERRCODE = 'CH017';
  END IF;

  UPDATE task_completion_submissions
  SET status                 = 'rejected',
      reviewed_by_profile_id = v_caller,
      reviewed_at            = now(),
      updated_at             = now()
  WHERE id = p_submission_id AND status = 'pending'
  RETURNING * INTO v_submission;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission is not pending review' USING ERRCODE = 'CH017';
  END IF;

  UPDATE tasks
  SET status = 'open'
  WHERE id = v_task_id AND status = 'needs_attention'
  RETURNING * INTO v_task;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow invariant violated: task/submission transition mismatch' USING ERRCODE = 'CH019';
  END IF;

  -- No points_balances / point_transactions mutation — matches legacy
  -- reject_task_completion exactly.
  RETURN v_submission;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_task_completion_v2(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_task_completion_v2(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reject_task_completion_v2(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.reject_task_completion_v2(uuid) TO service_role;

-- ============================================================
-- Legacy request_task_completion — CH020 coexistence guard
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_task_completion(p_task_id uuid)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_task   tasks%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Unlocked existence + household-context lookup — authorization is
  -- decided before any lock is taken, unchanged from before this
  -- migration.
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT internal.is_household_member(
    v_task.household_id, v_caller, ARRAY['child']::household_member_role[]
  ) OR v_task.assignee_profile_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Not authorized to request completion of this task' USING ERRCODE = '28000';
  END IF;

  -- First row lock acquired in this workflow — same pattern Slice 2A
  -- already established and QA-verified for the legacy review functions.
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT internal.is_household_member(
    v_task.household_id, v_caller, ARRAY['child']::household_member_role[]
  ) OR v_task.assignee_profile_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Not authorized to request completion of this task' USING ERRCODE = '28000';
  END IF;

  -- CH020: once a task has ANY task_completion_submissions history
  -- (pending or terminal), legacy v1 request may never create a new
  -- attempt for it again — see this migration's header comment.
  IF EXISTS (
    SELECT 1 FROM task_completion_submissions WHERE task_id = p_task_id
  ) THEN
    RAISE EXCEPTION 'Task has existing completion submission history; use the current completion workflow' USING ERRCODE = 'CH020';
  END IF;

  UPDATE tasks
  SET status = 'needs_attention'
  WHERE id = p_task_id
    AND status = 'open'
    AND assignee_profile_id = v_caller
  RETURNING * INTO v_task;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task is not open' USING ERRCODE = 'CH003';
  END IF;

  RETURN v_task;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_task_completion(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_task_completion(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.request_task_completion(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.request_task_completion(uuid) TO service_role;

-- ============================================================
-- public.tasks table privilege hardening
-- ============================================================
REVOKE ALL PRIVILEGES ON public.tasks FROM PUBLIC, anon, authenticated;

-- SELECT: unchanged in effect — still gated entirely by
-- tasks_select_household_member (TO authenticated only). anon was never
-- granted a matching policy and got zero rows regardless of table-level
-- privilege, so revoking anon's SELECT above changes nothing observable.
GRANT SELECT ON public.tasks TO authenticated;

-- INSERT: narrowed to exactly the columns insertTask()
-- (src/lib/repositories/tasks.ts) sends. status, completed_at,
-- completed_by_profile_id, and source_service_request_id are excluded —
-- an INSERT that omits them takes their schema DEFAULT (status -> 'open')
-- with no privilege check at all, so this does not change insertTask()'s
-- own behavior.
GRANT INSERT (household_id, title, description, created_by_profile_id,
              assigned_by_profile_id, assignee_profile_id, due_at,
              due_at_has_time, points) ON public.tasks TO authenticated;

-- UPDATE: no grant. Every legitimate task mutation already goes through a
-- SECURITY DEFINER RPC. tasks_update_adult_plus_or_assignee
-- (20260707000000) is left in place — not dropped, unrelated cleanup —
-- but is now dormant for `authenticated` since the underlying table
-- privilege no longer exists.

-- DELETE: no grant. The repository-wide audit found no direct task-delete
-- feature to preserve. tasks_delete_admin_plus (owner/admin only) is left
-- in place — not dropped, unrelated cleanup — but is now dormant for
-- `authenticated` since the underlying table privilege no longer exists.

-- service_role: explicit, not left to the platform default.
GRANT ALL PRIVILEGES ON public.tasks TO service_role;

-- ============================================================
-- tasks_insert_adult_plus — provenance/assignment hardening
-- ============================================================
DROP POLICY tasks_insert_adult_plus ON tasks;

CREATE POLICY tasks_insert_adult_plus
ON tasks
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_profile_id = auth.uid()
  AND internal.is_household_member(
    household_id, auth.uid(), ARRAY['owner','admin','adult']::household_member_role[]
  )
  AND (
    (assignee_profile_id IS NULL AND assigned_by_profile_id IS NULL)
    OR
    (assignee_profile_id IS NOT NULL
     AND internal.is_household_member(household_id, assignee_profile_id)
     AND assigned_by_profile_id = auth.uid())
  )
);

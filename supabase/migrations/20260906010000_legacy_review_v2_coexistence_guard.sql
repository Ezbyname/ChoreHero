-- Task Completion Photo Proof — Slice 2A: legacy review serialization +
-- v2 coexistence guard.
--
-- Scope: this migration touches ONLY approve_task_completion(uuid) and
-- reject_task_completion(uuid) (CREATE OR REPLACE, same signatures, no
-- DROP). It does not create request_task_completion_v2,
-- approve_task_completion_v2, or reject_task_completion_v2 — those are
-- Slice 2B, not implemented here. It does not touch
-- task_completion_submissions' schema (20260906000000), complete_task,
-- claim_open_task, or request_task_completion.
--
-- Problem this closes: a legacy review call reading tasks WITHOUT a lock,
-- checking for a pending task_completion_submissions row, and only later
-- performing its CAS UPDATE several lines further down leaves a window in
-- which a concurrent request_task_completion_v2 (Slice 2B, not yet
-- implemented, but already contractually required to acquire
-- `SELECT task FOR UPDATE` before it inserts a submission and transitions
-- the task open -> needs_attention) can commit in between the legacy
-- function's check and its own UPDATE. The legacy UPDATE's own CAS
-- (WHERE status = 'needs_attention') would then match the row v2 just
-- produced and succeed, producing task = completed/open with
-- submission = pending — exactly the corruption CH016 exists to prevent.
--
-- Fix: both legacy functions now acquire `SELECT ... FOR UPDATE` on the
-- task row as the FIRST row lock in the workflow, then check for a
-- pending submission, then perform their existing CAS UPDATE, all under
-- that same lock. request_task_completion_v2 (Slice 2B) will acquire the
-- same task-row lock before it does anything to that task or to
-- task_completion_submissions, so the two sides are mutually exclusive
-- for any given task: whichever transaction acquires the lock first runs
-- to completion (commit or abort) before the other proceeds, and the
-- second transaction — once unblocked — observes the fully committed
-- post-transaction state, never an in-flight partial one.
--
-- Lock-order rule for the whole Task Completion workflow (this slice and
-- all future v2 functions): the task row is the FIRST row lock acquired.
-- Read-only, unlocked lookups (existence, household context,
-- authorization) may still happen before that lock — "first lock
-- acquired" is not "first read performed." No function in this workflow
-- may lock any other workflow row (e.g. a task_completion_submissions
-- row) and only then attempt to lock the task row — that ordering would
-- invert the rule and reintroduce deadlock risk with request_v2's own
-- lock-then-insert sequence (and, in Slice 2B, with
-- approve/reject_task_completion_v2's own task-then-submission sequence).
--
-- Authorization-before-locking: the task row is locked only AFTER the
-- existing owner/admin/adult authorization check has already passed,
-- using an ordinary unlocked SELECT for that check exactly as today. An
-- unauthenticated or unauthorized caller is rejected (28000) before ever
-- reaching the FOR UPDATE statement or the CH016 check — so an
-- unauthorized caller can never observe, via timing or otherwise, whether
-- a pending v2 submission exists for a task they have no right to review.
--
-- Re-lock defensive NOT FOUND check: the FOR UPDATE re-select repeats the
-- "Task not found" (P0002) check. This is not redundant — it covers the
-- (narrow) window between the first unlocked SELECT and this lock
-- acquisition in which the task could in principle have been deleted
-- (e.g. a concurrent whole-household deletion).
--
-- Post-lock authorization re-check: the owner/admin/adult check is run a
-- SECOND time, against household_id from the LOCKED v_task, immediately
-- after the FOR UPDATE re-select and before the CH016 check. A fresh
-- repository-wide scan (grep for `household_id\s*=` across every
-- migration) confirms no existing RPC's UPDATE statement ever sets
-- tasks.household_id — there is currently no authorized lifecycle path
-- that changes it after creation. That fact alone would make this
-- re-check a provable no-op today, but the check is included anyway
-- rather than relying on that invariant continuing to hold indefinitely:
-- the authorization decision must be evaluated against the row state that
-- is actually about to be mutated, not only against an earlier unlocked
-- snapshot, so that a future change elsewhere (e.g. a household-transfer
-- feature) cannot silently reintroduce a stale-authorization bug here
-- without this function's own logic catching it. This re-check reuses the
-- same 28000 error and the same generic message as the first check — it
-- is not a new externally-visible outcome, and it runs BEFORE the CH016
-- check, so an unauthorized caller still learns nothing about pending
-- submission state.
--
-- CH016 = "legacy v1 review blocked because an active v2 submission
-- exists". CH016 was reserved in the approved Photo Proof design/
-- error-code plan (not inside any migration file — the Slice 1 migration,
-- 20260906000000_task_completion_submissions_schema.sql, only reserves
-- CH018 in its own comments) and confirmed collision-free by a fresh
-- repository-wide scan immediately before this migration was written
-- (CH014, CH015, CH016, CH017, CH019: zero occurrences anywhere in the
-- repository; CH018: exactly one occurrence, that same Slice 1
-- reservation comment, no implementation). This migration implements
-- CH016 only — CH014, CH015, CH017, CH018, CH019 remain reserved for
-- later slices and are not implemented here.
--
-- Approve's points_balances/point_transactions behavior is preserved
-- verbatim from its current authoritative body in
-- 20260816000000_award_task_completion_points.sql — not the earlier,
-- superseded body in 20260801000000_approve_reject_task_completion.sql.
-- The only points-relevant change is that CH016 now short-circuits before
-- the existing CAS UPDATE, so a blocked review reaches neither the CAS
-- nor the points block — exactly like an ordinary CH004 failure today.
--
-- Reject has no points/ledger behavior to preserve (unchanged from
-- 20260801000000_approve_reject_task_completion.sql) — CH016 short-
-- circuits before its own CAS UPDATE the same way.
--
-- Migration history rule: do not edit this file after it is applied.

CREATE OR REPLACE FUNCTION public.approve_task_completion(p_task_id uuid)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      uuid := auth.uid();
  v_task        tasks%ROWTYPE;
  v_new_balance integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Unlocked existence + household-context lookup, unchanged from before
  -- this migration — authorization is decided before any lock is taken.
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT internal.is_household_member(
    v_task.household_id, v_caller, ARRAY['owner','admin','adult']::household_member_role[]
  ) THEN
    RAISE EXCEPTION 'Not authorized to approve this task' USING ERRCODE = '28000';
  END IF;

  -- First row lock acquired in this workflow. Everything from here down
  -- (the coexistence check and the CAS UPDATE) runs against a row no
  -- concurrent request_task_completion_v2/approve/reject call can mutate
  -- until this transaction commits or aborts.
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    -- Defensive: the task existed at the unlocked read above but was
    -- deleted before this lock could be acquired.
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  -- Re-check authorization against the LOCKED row's household_id — see
  -- this migration's header comment for why this is included even though
  -- no authorized path currently changes it.
  IF NOT internal.is_household_member(
    v_task.household_id, v_caller, ARRAY['owner','admin','adult']::household_member_role[]
  ) THEN
    RAISE EXCEPTION 'Not authorized to approve this task' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM task_completion_submissions
    WHERE task_id = p_task_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Task has an active completion submission pending review' USING ERRCODE = 'CH016';
  END IF;

  UPDATE tasks
  SET status                  = 'completed',
      completed_at            = now(),
      completed_by_profile_id = v_task.assignee_profile_id
  WHERE id = p_task_id
    AND status = 'needs_attention'
  RETURNING * INTO v_task;

  IF NOT FOUND THEN
    -- Task existed, caller was authorized, and no pending v2 submission
    -- blocked review, but status was not 'needs_attention' at the moment
    -- of the update (already reviewed, or otherwise moved) — either
    -- genuinely stale, or lost a race between the checks above and this
    -- UPDATE. Both are "not pending review" from the caller's point of
    -- view. Aborts here — nothing below this point ever runs.
    RAISE EXCEPTION 'Task is not pending review' USING ERRCODE = 'CH004';
  END IF;

  INSERT INTO points_balances (household_id, profile_id, balance)
  VALUES (v_task.household_id, v_task.completed_by_profile_id, v_task.points)
  ON CONFLICT ON CONSTRAINT uq_points_balances_household_profile
  DO UPDATE SET balance = points_balances.balance + EXCLUDED.balance,
                updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO point_transactions
    (household_id, profile_id, type, amount, balance_after, task_id, created_by_profile_id)
  VALUES
    (v_task.household_id, v_task.completed_by_profile_id, 'task_completed',
     v_task.points, v_new_balance, v_task.id, v_caller);

  RETURN v_task;
END;
$$;

-- REVOKE FROM PUBLIC alone does not make this authenticated-only: a fresh
-- Slice 2A QA preflight found that both approve_task_completion and
-- reject_task_completion already carried an explicit, independently
-- granted anon EXECUTE privilege in QA — not inherited from PUBLIC, but
-- from Supabase's own default ACL for functions created in schema
-- public (pg_default_acl, defaclobjtype = 'f'), which grants EXECUTE to
-- postgres, anon, authenticated, and service_role unless revoked at
-- creation time. Neither this function's own prior migrations nor this
-- one previously revoked anon explicitly, so that default grant survived
-- untouched through every earlier CREATE OR REPLACE. anon is revoked
-- explicitly below for that reason. service_role is deliberately left
-- untouched — revoking it is out of Slice 2A's scope and not something
-- this migration's own problem statement requires.
REVOKE EXECUTE ON FUNCTION public.approve_task_completion(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_task_completion(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.approve_task_completion(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_task_completion(p_task_id uuid)
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

  -- Unlocked existence + household-context lookup, unchanged from before
  -- this migration — authorization is decided before any lock is taken.
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT internal.is_household_member(
    v_task.household_id, v_caller, ARRAY['owner','admin','adult']::household_member_role[]
  ) THEN
    RAISE EXCEPTION 'Not authorized to reject this task' USING ERRCODE = '28000';
  END IF;

  -- First row lock acquired in this workflow — see approve_task_completion
  -- above and this migration's header comment for the full reasoning.
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  -- Re-check authorization against the LOCKED row's household_id — see
  -- approve_task_completion above and this migration's header comment for
  -- the full reasoning.
  IF NOT internal.is_household_member(
    v_task.household_id, v_caller, ARRAY['owner','admin','adult']::household_member_role[]
  ) THEN
    RAISE EXCEPTION 'Not authorized to reject this task' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM task_completion_submissions
    WHERE task_id = p_task_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Task has an active completion submission pending review' USING ERRCODE = 'CH016';
  END IF;

  UPDATE tasks
  SET status = 'open'
  WHERE id = p_task_id
    AND status = 'needs_attention'
  RETURNING * INTO v_task;

  IF NOT FOUND THEN
    -- Same "not pending review" condition as approve_task_completion,
    -- from the reject side.
    RAISE EXCEPTION 'Task is not pending review' USING ERRCODE = 'CH005';
  END IF;

  RETURN v_task;
END;
$$;

-- Same anon finding as approve_task_completion above — see that block's
-- comment for the full explanation (Supabase's default function ACL, not
-- an inherited PUBLIC grant).
REVOKE EXECUTE ON FUNCTION public.reject_task_completion(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_task_completion(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reject_task_completion(uuid) TO authenticated;

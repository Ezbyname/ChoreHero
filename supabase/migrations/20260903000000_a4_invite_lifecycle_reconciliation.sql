-- A4 Invite lifecycle/security reconciliation
--
-- This is a new forward reconciliation migration.
-- It does NOT claim to recreate the missing historical 20260831 migrations.
--
-- Purpose:
--   1. Restrict client INSERT to the four approved invite-creation columns.
--   2. Remove general client UPDATE/DELETE authority.
--   3. Harden INSERT RLS server-owned invariants.
--   4. Add the dedicated revoke RPC.
--   5. Enforce Child multi-use and Adult/Admin single-use redemption semantics.
--   6. Restrict RPC EXECUTE to authenticated callers.
--
-- The statements below are intentionally replay-safe.

-- ============================================================
-- household_invites client privileges
-- ============================================================

-- Remove broad table-level DML grants.
REVOKE INSERT, UPDATE, DELETE
ON TABLE public.household_invites
FROM anon, authenticated;

-- Also remove any column-level INSERT/UPDATE grants that may exist
-- independently of the table-level grants.
REVOKE INSERT (
  id,
  household_id,
  code,
  role,
  created_by_profile_id,
  redemption_count,
  revoked_at,
  expires_at,
  created_at
)
ON TABLE public.household_invites
FROM anon, authenticated;

REVOKE UPDATE (
  id,
  household_id,
  code,
  role,
  created_by_profile_id,
  redemption_count,
  revoked_at,
  expires_at,
  created_at
)
ON TABLE public.household_invites
FROM anon, authenticated;

-- Authenticated clients may provide only the four creation inputs.
GRANT INSERT (
  household_id,
  code,
  role,
  created_by_profile_id
)
ON TABLE public.household_invites
TO authenticated;

-- ============================================================
-- household_invites RLS
-- ============================================================

DROP POLICY IF EXISTS household_invites_insert_household_admin
ON public.household_invites;

DROP POLICY IF EXISTS household_invites_update_household_admin
ON public.household_invites;

CREATE POLICY household_invites_insert_household_admin
ON public.household_invites
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_profile_id = auth.uid()
  AND internal.is_household_member(
    household_id,
    auth.uid(),
    ARRAY['owner','admin']::household_member_role[]
  )
  AND redemption_count = 0
  AND revoked_at IS NULL
  AND expires_at = (now() + interval '30 days')
  AND created_at = now()
);

-- There is deliberately no UPDATE or DELETE policy.
-- Revocation is performed only through revoke_household_invite().

-- ============================================================
-- redeem_household_invite
-- ============================================================

CREATE OR REPLACE FUNCTION public.redeem_household_invite(
  p_code         text,
  p_display_name text,
  p_avatar_emoji text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite    household_invites%ROWTYPE;
  v_caller    uuid := auth.uid();
  v_is_member boolean;
  v_new_rows  integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'Display name is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invite
  FROM household_invites
  WHERE code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite has been revoked' USING ERRCODE = '28000';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired' USING ERRCODE = '28000';
  END IF;

  INSERT INTO profiles (id, display_name, avatar_emoji)
  VALUES (v_caller, btrim(p_display_name), p_avatar_emoji)
  ON CONFLICT (id) DO NOTHING;

  -- Already-member handling MUST precede exhaustion evaluation.
  -- Same-user retry is idempotent and never increments redemption_count.
  SELECT EXISTS (
    SELECT 1
    FROM household_members
    WHERE household_id = v_invite.household_id
      AND profile_id = v_caller
  ) INTO v_is_member;

  IF v_is_member THEN
    RETURN v_invite.household_id;
  END IF;

  -- Adult/Admin are single-use for NEW memberships.
  -- Child invites remain multi-use.
  IF v_invite.role IN ('adult', 'admin')
     AND v_invite.redemption_count > 0 THEN
    RAISE EXCEPTION 'Invite has already been used'
      USING ERRCODE = '28000';
  END IF;

  INSERT INTO household_members (household_id, profile_id, role)
  VALUES (v_invite.household_id, v_caller, v_invite.role)
  ON CONFLICT (household_id, profile_id) DO NOTHING;

  GET DIAGNOSTICS v_new_rows = ROW_COUNT;

  UPDATE household_invites
  SET redemption_count = redemption_count + v_new_rows
  WHERE id = v_invite.id;

  RETURN v_invite.household_id;
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.redeem_household_invite(text, text, text)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.redeem_household_invite(text, text, text)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.redeem_household_invite(text, text, text)
TO authenticated;

-- ============================================================
-- revoke_household_invite
-- ============================================================

CREATE OR REPLACE FUNCTION public.revoke_household_invite(
  p_invite_id uuid
) RETURNS household_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_invite public.household_invites%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_invite
  FROM public.household_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT internal.is_household_member(
    v_invite.household_id,
    v_caller,
    ARRAY['owner','admin']::household_member_role[]
  ) THEN
    RAISE EXCEPTION 'Not authorized to revoke this invite'
      USING ERRCODE = '28000';
  END IF;

  UPDATE public.household_invites
  SET revoked_at = now()
  WHERE id = p_invite_id
    AND revoked_at IS NULL
  RETURNING * INTO v_invite;

  IF NOT FOUND THEN
    -- Already revoked: terminal idempotent success.
    SELECT * INTO v_invite
    FROM public.household_invites
    WHERE id = p_invite_id;
  END IF;

  RETURN v_invite;
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.revoke_household_invite(uuid)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.revoke_household_invite(uuid)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.revoke_household_invite(uuid)
TO authenticated;
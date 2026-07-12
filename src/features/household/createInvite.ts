import { hasHouseholdPermission } from '@/domain/permissions';
import { createHouseholdInvite } from '@/lib/repositories';
import type { HouseholdInviteRow, HouseholdMemberRole } from '@/types/supabase';

export type CreateInviteResult =
  | { ok: true; invite: HouseholdInviteRow }
  | { ok: false; reason: 'not_authorized' | 'failed' };

interface CreateInviteInput {
  householdId:        string;
  createdByProfileId: string;
  role:                Extract<HouseholdMemberRole, 'admin' | 'adult' | 'child'>;
  callerRole:          string | null;
}

// Owner/admin only — matches household_invites_insert_household_admin (RLS)
// exactly. 'owner' can never be minted via invite (DB CHECK constraint);
// the role picker in the UI must never offer it.
export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
  if (!hasHouseholdPermission(input.callerRole, 'household.invite')) {
    return { ok: false, reason: 'not_authorized' };
  }

  const result = await createHouseholdInvite({
    householdId:        input.householdId,
    createdByProfileId: input.createdByProfileId,
    role:                input.role,
  });

  if (result.error || !result.data) return { ok: false, reason: 'failed' };
  return { ok: true, invite: result.data };
}

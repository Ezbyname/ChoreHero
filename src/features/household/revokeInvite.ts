import { hasHouseholdPermission } from '@/domain/permissions';
import { revokeHouseholdInvite } from '@/lib/repositories';

export type RevokeInviteResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'failed' };

interface RevokeInviteInput {
  inviteId:   string;
  callerRole: string | null;
}

export async function revokeInvite(input: RevokeInviteInput): Promise<RevokeInviteResult> {
  if (!hasHouseholdPermission(input.callerRole, 'household.invite')) {
    return { ok: false, reason: 'not_authorized' };
  }

  const result = await revokeHouseholdInvite(input.inviteId);
  if (result.error) return { ok: false, reason: 'failed' };
  return { ok: true };
}

import type { HouseholdMember } from '@/types';

export function getMemberByUserId(
  members:  HouseholdMember[],
  userId:   string | undefined,
): HouseholdMember | undefined {
  if (!userId) return undefined;
  return members.find((m) => m.userId === userId);
}

export function getMemberNameByUserId(
  members:  HouseholdMember[],
  userId:   string | undefined,
  fallback  = 'Someone',
): string {
  return getMemberByUserId(members, userId)?.name ?? fallback;
}

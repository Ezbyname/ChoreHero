import type { UserRole } from './user';

export interface HouseholdMember {
  id: string;
  userId: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
}

export interface Household {
  id: string;
  name: string;
  members: HouseholdMember[];
}

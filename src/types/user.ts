export type UserRole = 'owner' | 'admin' | 'member' | 'child';

export interface AppUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

// 'adult' added in T1.4.7 to match the database household_member_role enum.
// 'member' is retained for mock seed backward compatibility.
export type UserRole = 'owner' | 'admin' | 'adult' | 'member' | 'child';

export interface AppUser {
  id:        string;
  name:      string;
  email?:    string;
  avatarUrl?: string;
}

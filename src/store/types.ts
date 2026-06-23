export type UserRole = 'owner' | 'admin' | 'member' | 'child';

export interface AppUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

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

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus =
  | 'open'
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'needs_attention';

export interface Task {
  id: string;
  title: string;
  description?: string;
  assigneeId?: string;
  createdById?: string;
  householdId?: string;
  dueAt?: string;
  priority: TaskPriority;
  status: TaskStatus;
  points?: number;
}

export interface AppState {
  user: AppUser | null;
  household: Household | null;
  tasks: Task[];
}

import type { AppUser } from '@/types';

export const mockUser: AppUser = {
  id:        'user-dad',
  name:      'Dad',
  email:     'dad@family.home',
  avatarUrl: undefined,
};

export const mockCurrentUser: AppUser  = mockUser;
export const mockCurrentUserId: string = mockCurrentUser.id;

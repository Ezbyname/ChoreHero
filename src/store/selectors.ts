import type { AppStore } from '@/store/useAppStore';

// Raw state selectors
export const selectCurrentUser     = (s: AppStore) => s.user;
export const selectCurrentHousehold= (s: AppStore) => s.household;
export const selectTasks           = (s: AppStore) => s.tasks;
export const selectRewards         = (s: AppStore) => s.rewards;
export const selectPointsBalances  = (s: AppStore) => s.pointsBalances;
export const selectIsMockHydrated  = (s: AppStore) => s.isMockHydrated;

// Lightweight UI/Auth convenience selectors
export const selectIsAuthenticated  = (s: AppStore): boolean => Boolean(s.user);
export const selectCurrentUserName  = (s: AppStore): string | null => s.user?.name ?? null;

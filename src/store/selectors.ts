import type { AppStore } from '@/store/useAppStore';

// ── App data selectors ────────────────────────────────────────────────────────

export const selectCurrentUser      = (s: AppStore) => s.user;
export const selectCurrentHousehold = (s: AppStore) => s.household;
export const selectTasks            = (s: AppStore) => s.tasks;
export const selectRewards          = (s: AppStore) => s.rewards;
export const selectPointsBalances   = (s: AppStore) => s.pointsBalances;
export const selectIsMockHydrated   = (s: AppStore) => s.isMockHydrated;

export const selectCurrentUserName = (s: AppStore): string | null =>
  s.user?.name ?? null;

// ── Auth selectors ────────────────────────────────────────────────────────────

export const selectAuthSession    = (s: AppStore) => s.authSession;
export const selectAuthUser       = (s: AppStore) => s.authUser;
export const selectIsAuthResolved = (s: AppStore) => s.isAuthResolved;
export const selectIsAuthLoading  = (s: AppStore) => s.isAuthLoading;
export const selectAuthError      = (s: AppStore) => s.authError;

export const selectAuthUserEmail = (s: AppStore): string | null =>
  s.authUser?.email ?? null;

// True once Supabase auth identity is confirmed (signed in or signed out).
// Gates AuthGate in T1.3.3. Derived from authUser, not legacy `user`.
export const selectIsAuthenticated = (s: AppStore): boolean =>
  Boolean(s.authUser);

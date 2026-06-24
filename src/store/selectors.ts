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
export const selectIsAuthenticated = (s: AppStore): boolean =>
  Boolean(s.authUser);

// ── Hydration selectors ───────────────────────────────────────────────────────

export const selectAppHydrationState     = (s: AppStore) => s.appHydrationState;
export const selectIsAppDataReady        = (s: AppStore) => s.isAppDataReady;
export const selectIsAppDataLoading      = (s: AppStore) => s.isAppDataLoading;
export const selectAppDataError          = (s: AppStore) => s.appDataError;
export const selectActiveHouseholdId     = (s: AppStore) => s.activeHouseholdId;
export const selectHasNoHousehold        = (s: AppStore) => s.hasNoHousehold;
export const selectAppDataVersion        = (s: AppStore) => s.appDataVersion;
export const selectHydratedForAuthUserId = (s: AppStore) => s.hydratedForAuthUserId;
export const selectHydrationRunId        = (s: AppStore) => s.hydrationRunId;
export const selectHydrationSequence     = (s: AppStore) => s.hydrationSequence;

// True if the store holds hydrated data for the currently authenticated user.
export const selectIsHydratedForCurrentUser = (s: AppStore): boolean =>
  Boolean(s.authUser) &&
  s.hydratedForAuthUserId === s.authUser?.id &&
  (s.appHydrationState === 'hydrated' || s.appHydrationState === 'partial');

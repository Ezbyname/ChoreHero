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
export const selectAppDataErrorCode      = (s: AppStore) => s.appDataErrorCode;
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

// True when the auth user has no ChoreHero profile yet.
// Drives ProfileSetupScreen visibility via AuthenticatedAppGate.
// This is a recovery UX state, not a hydration state variant.
export const selectNeedsProfileSetup = (s: AppStore): boolean =>
  s.appHydrationState === 'error' && s.appDataErrorCode === 'missing_profile';

// ── Active household selectors (T1.5.5) ──────────────────────────────────────
//
// Hydration owns active household selection (AppDataBootstrap → commitHydrationSnapshot).
// These selectors expose the already-selected result to UI.
// Screens must consume these; they must not call .find(...) or access households[0].

// Alias of selectCurrentHousehold — same field, semantic name for T1.5.5+ screens.
// Using an alias prevents drift: both always return s.household.
export const selectActiveHousehold = selectCurrentHousehold;

// Derived from selectActiveHousehold — never resolved independently by screens.
export const selectActiveHouseholdName = (s: AppStore): string | null =>
  selectActiveHousehold(s)?.name ?? null;

// True only in the fully hydrated state with a non-null household.
// 'partial' state = profile exists but no household; not considered "active".
export const selectHasActiveHousehold = (s: AppStore): boolean =>
  s.appHydrationState === 'hydrated' && selectActiveHousehold(s) !== null;

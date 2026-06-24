import React, { useEffect, useRef } from 'react';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { useAppStore } from '@/store/useAppStore';
import { sortHouseholdCandidatesDeterministically } from '@/guards/hydrationInvariants';
import {
  selectIsAuthResolved,
  selectIsAuthenticated,
  selectAuthUser,
  selectAppHydrationState,
  selectHydratedForAuthUserId,
} from '@/store/selectors';
import {
  getProfileById,
  getHouseholdsForProfile,
  getHouseholdMembers,
  getTasksForHousehold,
  getRewardsForHousehold,
  getPointsBalancesForHousehold,
} from '@/lib/repositories';
import type { HydrationContext } from '@/types/hydration';
import type { HouseholdRow } from '@/types/supabase';

interface AppDataBootstrapProps {
  children: React.ReactNode;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function createHydrationRunId(): string {
  return `hydration-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Active-household selection rule (determinism guarantee):
//   1. profile.default_household_id if set and member of that household
//   2. households[0] from the deterministically sorted array
//
// Repository ordering (.order('created_at')) is a performance/stability hint.
// sortHouseholdCandidatesDeterministically is the hydration layer's authoritative
// sort and runs here even when the repository already ordered results.
function resolveActiveHousehold(
  defaultHouseholdId: string | null,
  households: HouseholdRow[],
): HouseholdRow | null {
  if (households.length === 0) return null;
  if (defaultHouseholdId) {
    const preferred = households.find((h) => h.id === defaultHouseholdId);
    if (preferred) return preferred;
  }
  // Apply authoritative deterministic sort before choosing the first candidate.
  const sorted = sortHouseholdCandidatesDeterministically(households);
  return sorted[0];
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Watches auth state and hydrates app data from Supabase when the user signs in.
 *
 * Responsibilities:
 *   - Run hydration when auth is resolved + authenticated + Supabase is configured
 *   - Track pending hydration intent when canHydrateAppData becomes true after auth
 *   - Guard against stale/out-of-order run completions via runId + sequence
 *   - Clear app data on sign-out
 *   - Three-phase hydration: profile → structure → domain (parallel)
 *   - partial state = profile exists, no household membership
 *   - Domain failures result in error, never partial commit
 *
 * AppDataBootstrap is the sole caller of hydration store actions.
 */
export function AppDataBootstrap({ children }: AppDataBootstrapProps) {
  const isAuthResolved  = useAppStore(selectIsAuthResolved);
  const isAuthenticated = useAppStore(selectIsAuthenticated);
  const authUser        = useAppStore(selectAuthUser);
  const appHydrationState     = useAppStore(selectAppHydrationState);
  const hydratedForAuthUserId = useAppStore(selectHydratedForAuthUserId);

  const startHydrationRun         = useAppStore((s) => s.startHydrationRun);
  const setAppHydrationState      = useAppStore((s) => s.setAppHydrationState);
  const setAppDataError           = useAppStore((s) => s.setAppDataError);
  const commitHydrationSnapshot   = useAppStore((s) => s.commitHydrationSnapshot);
  const clearAppData              = useAppStore((s) => s.clearAppData);
  const markAppHydrationAuthResolved = useAppStore((s) => s.markAppHydrationAuthResolved);

  // Monotonically increasing — never reset, ensures late completions are rejected.
  const hydrationSequenceRef = useRef(0);
  // Set when auth is authenticated but canHydrateAppData is not yet true.
  const pendingHydrationRef  = useRef(false);

  // Supabase client is ready — only then can we run real hydration.
  const canHydrateAppData =
    isAuthResolved && isAuthenticated && !!authUser && isSupabaseConfigured;

  useEffect(() => {
    if (!isAuthResolved) {
      // Auth not yet resolved — nothing to do yet.
      return;
    }

    if (!isAuthenticated || !authUser) {
      // Signed out (or never signed in).
      clearAppData();
      pendingHydrationRef.current = false;
      markAppHydrationAuthResolved();
      return;
    }

    // Authenticated below this line.

    if (!canHydrateAppData) {
      // Auth is ready but Supabase isn't configured (e.g. dev/mock mode).
      // Record pending intent so we run hydration if Supabase becomes available.
      pendingHydrationRef.current = true;
      markAppHydrationAuthResolved();
      return;
    }

    // canHydrateAppData is true — evaluate whether to trigger a run.
    const userChanged       = authUser.id !== hydratedForAuthUserId;
    const notHydratedForUser = appHydrationState === 'idle' || appHydrationState === 'error';
    const shouldHydrate     =
      pendingHydrationRef.current || userChanged || notHydratedForUser;

    if (!shouldHydrate) {
      return;
    }

    // Clear pending intent before starting.
    pendingHydrationRef.current = false;

    const runId    = createHydrationRunId();
    const sequence = hydrationSequenceRef.current + 1;
    hydrationSequenceRef.current = sequence;

    startHydrationRun({ runId, sequence });

    const run = async () => {
      try {
        await hydrateForUser({ userId: authUser.id, runId, sequence });
      } catch {
        // Unexpected error escaped the hydration pipeline (network failure, etc.).
        // Only commit the error if this run is still current.
        if (
          hydrationSequenceRef.current === sequence
        ) {
          setAppHydrationState('error');
          setAppDataError('An unexpected error occurred. Please try again.');
        }
      }
    };

    run();
  }, [isAuthResolved, isAuthenticated, authUser?.id, canHydrateAppData]);

  // ── Three-phase hydration ─────────────────────────────────────────────────

  async function hydrateForUser({
    userId,
    runId,
    sequence,
  }: {
    userId:   string;
    runId:    string;
    sequence: number;
  }): Promise<void> {

    // Helper: check if this run has been superseded.
    const isStale = () => hydrationSequenceRef.current !== sequence;

    // ── Phase 1: Profile ──────────────────────────────────────────────────

    const profileResult = await getProfileById(userId);

    if (isStale()) return;

    if (profileResult.error || !profileResult.data) {
      setAppHydrationState('error');
      setAppDataError(
        profileResult.error?.message ?? 'Profile not found. Please sign out and sign in again.',
      );
      return;
    }

    const profile = profileResult.data;

    // ── Phase 2: Structure (household) ───────────────────────────────────

    const householdsResult = await getHouseholdsForProfile(profile.id);

    if (isStale()) return;

    if (householdsResult.error) {
      setAppHydrationState('error');
      setAppDataError(householdsResult.error.message);
      return;
    }

    const activeHousehold = resolveActiveHousehold(
      profile.default_household_id,
      householdsResult.data,
    );

    if (!activeHousehold) {
      // Valid state: profile loaded, no household membership.
      // Commit as partial — UI shows household setup flow.
      const context: HydrationContext = {
        profile,
        household:         null,
        householdMembers:  [],
        tasks:             [],
        rewards:           [],
        pointsBalances:    [],
        activeHouseholdId: null,
        hasNoHousehold:    true,
      };
      commitHydrationSnapshot({ context, runId, sequence });
      return;
    }

    // ── Phase 3: Domain (parallel) ───────────────────────────────────────

    const [membersResult, tasksResult, rewardsResult, pointsResult] = await Promise.all([
      getHouseholdMembers(activeHousehold.id),
      getTasksForHousehold(activeHousehold.id),
      getRewardsForHousehold(activeHousehold.id),
      getPointsBalancesForHousehold(activeHousehold.id),
    ]);

    if (isStale()) return;

    // Any domain failure → error. Check individually for proper type narrowing.
    // Do not commit partial domain data on failure.
    if (membersResult.error) {
      setAppHydrationState('error');
      setAppDataError(membersResult.error.message);
      return;
    }
    if (tasksResult.error) {
      setAppHydrationState('error');
      setAppDataError(tasksResult.error.message);
      return;
    }
    if (rewardsResult.error) {
      setAppHydrationState('error');
      setAppDataError(rewardsResult.error.message);
      return;
    }
    if (pointsResult.error) {
      setAppHydrationState('error');
      setAppDataError(pointsResult.error.message);
      return;
    }

    // All domain results are non-null at this point (discriminated union narrowed above).
    const context: HydrationContext = {
      profile,
      household:         activeHousehold,
      householdMembers:  membersResult.data,
      tasks:             tasksResult.data,
      rewards:           rewardsResult.data,
      pointsBalances:    pointsResult.data,
      activeHouseholdId: activeHousehold.id,
      hasNoHousehold:    false,
    };

    commitHydrationSnapshot({ context, runId, sequence });
  }

  return <>{children}</>;
}

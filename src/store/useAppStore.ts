import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { mockSeed } from '@/mock';
import type { AppUser, Household, HouseholdMember, PointsBalance, Reward, Task, UserRole } from '@/types';
import type { AppHydrationState, HydrationContext } from '@/types/hydration';
import type { HouseholdMemberRole, TaskRow, RewardRow, PointsBalanceRow } from '@/types/supabase';
import {
  isHydrationCommitAllowed,
  assertValidHydrationContext,
  assertPartialHydrationContext,
} from '@/guards/hydrationInvariants';

// ============================================================
// STATE
// ============================================================

export interface AppState {
  // ── App data (UI projection of DB state) ─────────────────────────────────
  user:             AppUser | null;
  household:        Household | null;
  tasks:            Task[];
  rewards:          Reward[];
  pointsBalances:   PointsBalance[];
  isMockHydrated:   boolean;

  // ── Supabase auth identity (managed exclusively by AuthBootstrap) ─────────
  authSession:      Session | null;
  authUser:         User | null;
  isAuthResolved:   boolean;
  isAuthLoading:    boolean;
  authError:        string | null;

  // ── App data hydration ───────────────────────────────────────────────────
  appHydrationState:     AppHydrationState;
  isAppDataReady:        boolean;
  isAppDataLoading:      boolean;
  appDataError:          string | null;
  activeHouseholdId:     string | null;
  hasNoHousehold:        boolean;
  appDataVersion:        number;
  hydratedForAuthUserId: string | null;
  hydrationRunId:        string | null;
  hydrationSequence:     number;
}

// ============================================================
// ACTIONS
// ============================================================

interface AppActions {
  // ── App data (mock / reset) ───────────────────────────────────────────────
  setUser:             (user: AppUser | null) => void;
  setHousehold:        (household: Household | null) => void;
  setTasks:            (tasks: Task[]) => void;
  setRewards:          (rewards: Reward[]) => void;
  setPointsBalances:   (balances: PointsBalance[]) => void;
  hydrateFromMockSeed: () => void;
  resetAppState:       () => void;

  // ── Auth (AuthBootstrap is the sole caller) ───────────────────────────────
  applyAuthSession:    (session: Session | null) => void;
  clearAuthSession:    () => void;
  setAuthLoading:      (isLoading: boolean) => void;
  setAuthError:        (error: string | null) => void;
  markAuthResolved:    () => void;

  // ── Hydration (AppDataBootstrap is the sole caller) ──────────────────────
  startHydrationRun(input: { runId: string; sequence: number }): void;
  setAppHydrationState(state: AppHydrationState): void;
  setAppDataError(error: string | null): void;
  commitHydrationSnapshot(input: {
    context:  HydrationContext;
    runId:    string;
    sequence: number;
  }): void;
  clearAppData(): void;
  markAppHydrationAuthResolved(): void;
}

export type AppStore = AppState & AppActions;

// ============================================================
// INITIAL STATE
// ============================================================

const initialState: AppState = {
  user:             null,
  household:        null,
  tasks:            [],
  rewards:          [],
  pointsBalances:   [],
  isMockHydrated:   false,

  authSession:      null,
  authUser:         null,
  isAuthResolved:   false,
  isAuthLoading:    false,
  authError:        null,

  appHydrationState:     'idle',
  isAppDataReady:        false,
  isAppDataLoading:      false,
  appDataError:          null,
  activeHouseholdId:     null,
  hasNoHousehold:        false,
  appDataVersion:        0,
  hydratedForAuthUserId: null,
  hydrationRunId:        null,
  hydrationSequence:     0,
};

// ============================================================
// DB ROW → APP TYPE MAPPERS
// ============================================================

function mapMemberRole(role: HouseholdMemberRole): UserRole {
  // DB 'adult' maps to the 'adult' role (added to UserRole in T1.4.7).
  // All other values ('owner' | 'admin' | 'child') are identical in both.
  return role as UserRole;
}

function mapHouseholdMembers(
  rows: HydrationContext['householdMembers'],
): HouseholdMember[] {
  return rows.map((m) => ({
    id:        m.id,
    userId:    m.profile_id,
    // display_name_override is set per household; full name requires a profile join.
    // Profile joins are deferred — T1.4.7 resolves names from available data only.
    name:      m.display_name_override ?? m.profile_id,
    role:      mapMemberRole(m.role),
    avatarUrl: undefined,
  }));
}

function mapTaskRow(t: TaskRow): Task {
  return {
    id:          t.id,
    title:       t.title,
    description: t.description ?? undefined,
    assigneeId:  t.assignee_profile_id ?? undefined,
    createdById: t.created_by_profile_id,
    householdId: t.household_id,
    dueAt:       t.due_at ?? undefined,
    status:      t.status as Task['status'], // DB statuses are a subset of app TaskStatus
    points:      t.points,
    // priority: not in DB schema; omitted (field is optional)
  };
}

function mapRewardRow(r: RewardRow): Reward {
  return {
    id:             r.id,
    householdId:    r.household_id,
    title:          r.title,
    description:    r.description ?? undefined,
    requiredPoints: r.points_required,
    isActive:       r.status === 'active',
  };
}

function mapPointsBalanceRow(pb: PointsBalanceRow): PointsBalance {
  return {
    userId:      pb.profile_id,
    householdId: pb.household_id,
    balance:     pb.balance,
    // totalEarned / totalRedeemed require summing point_transactions — deferred
  };
}

// ============================================================
// STORE
// ============================================================

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,

  // ── App data actions ─────────────────────────────────────────────────────

  setUser:           (user)      => set({ user }),
  setHousehold:      (household) => set({ household }),
  setTasks:          (tasks)     => set({ tasks }),
  setRewards:        (rewards)   => set({ rewards }),
  setPointsBalances: (balances)  => set({ pointsBalances: balances }),

  hydrateFromMockSeed: () =>
    set((state) => {
      if (state.isMockHydrated) return state;
      return {
        user:           mockSeed.currentUser,
        household:      mockSeed.household,
        tasks:          mockSeed.tasks,
        rewards:        mockSeed.rewards,
        pointsBalances: mockSeed.pointsBalances,
        isMockHydrated: true,
      };
    }),

  resetAppState: () => set(initialState),

  // ── Auth actions (AuthBootstrap is the sole caller) ──────────────────────

  applyAuthSession: (session) =>
    set({
      authSession:    session,
      authUser:       session?.user ?? null,
      isAuthResolved: true,
      isAuthLoading:  false,
      authError:      null,
    }),

  clearAuthSession: () =>
    set({
      authSession:    null,
      authUser:       null,
      isAuthResolved: true,
      isAuthLoading:  false,
      authError:      null,
    }),

  setAuthLoading:   (isLoading) => set({ isAuthLoading: isLoading }),
  setAuthError:     (error)     => set({ authError: error }),
  markAuthResolved: ()          => set({ isAuthResolved: true }),

  // ── Hydration actions (AppDataBootstrap is the sole caller) ──────────────

  startHydrationRun: ({ runId, sequence }) =>
    set({
      hydrationRunId:    runId,
      hydrationSequence: sequence,
      appHydrationState: 'loading',
      isAppDataLoading:  true,
      appDataError:      null,
    }),

  // When setting 'error', also clear loading so the UI is never stuck.
  // Other state transitions (idle → loading) are driven by startHydrationRun.
  setAppHydrationState: (state) =>
    set({
      appHydrationState: state,
      isAppDataLoading:  state === 'loading',
    }),

  setAppDataError: (error) =>
    set({ appDataError: error }),

  // Single atomic commit for Supabase hydration snapshots.
  // This is the sole enforcement point for hydration snapshot validity.
  // Guards run before any app data is mutated; failures never partially commit.
  commitHydrationSnapshot: ({ context, runId, sequence }) =>
    set((state) => {
      // ── Guard 1: commit identity ──────────────────────────────────────────
      // Reject stale runs (logout, user switch, React StrictMode, duplicate events).
      if (!isHydrationCommitAllowed({
        currentRunId:     state.hydrationRunId,
        currentSequence:  state.hydrationSequence,
        incomingRunId:    runId,
        incomingSequence: sequence,
      })) {
        return state;
      }

      // ── Guard 2: context consistency ──────────────────────────────────────
      // Validate snapshot shape and cross-entity household consistency.
      // On invariant violation: surface as error, do not partially commit.
      try {
        if (context.hasNoHousehold) {
          assertPartialHydrationContext(context);
        } else {
          assertValidHydrationContext(context);
        }
      } catch (err) {
        return {
          ...state,
          appHydrationState: 'error' as AppHydrationState,
          isAppDataLoading:  false,
          appDataError:
            err instanceof Error
              ? err.message
              : 'Hydration context invariant failed.',
        };
      }

      const isPartial = context.hasNoHousehold;

      const user: AppUser = {
        id:        context.profile.id,
        name:      context.profile.display_name,
        avatarUrl: context.profile.avatar_url ?? undefined,
        // email comes from authUser; not stored in profiles table
      };

      const household: Household | null = context.household
        ? {
            id:      context.household.id,
            name:    context.household.name,
            members: mapHouseholdMembers(context.householdMembers),
          }
        : null;

      return {
        user,
        household,
        tasks:           context.tasks.map(mapTaskRow),
        rewards:         context.rewards.map(mapRewardRow),
        pointsBalances:  context.pointsBalances.map(mapPointsBalanceRow),

        activeHouseholdId:     context.activeHouseholdId,
        hasNoHousehold:        context.hasNoHousehold,
        appHydrationState:     isPartial ? 'partial' : 'hydrated',
        isAppDataReady:        true,
        isAppDataLoading:      false,
        appDataError:          null,
        hydratedForAuthUserId: context.profile.id,
        appDataVersion:        state.appDataVersion + 1,
      };
    }),

  // Called on sign-out or when switching to a user with no valid session.
  // Resets all app data and hydration state without touching auth fields.
  clearAppData: () =>
    set({
      user:             null,
      household:        null,
      tasks:            [],
      rewards:          [],
      pointsBalances:   [],

      activeHouseholdId:     null,
      hasNoHousehold:        false,
      appHydrationState:     'idle',
      isAppDataReady:        false,
      isAppDataLoading:      false,
      appDataError:          null,
      hydratedForAuthUserId: null,
      hydrationRunId:        null,
      // hydrationSequence is NOT reset: it is monotonically increasing
      // to ensure late completions from any past run are correctly rejected.
    }),

  // Called by AppDataBootstrap when auth has resolved but no hydration is needed
  // (e.g. unauthenticated state on initial load, or Supabase not configured).
  // Ensures isAppDataLoading is never left stuck at true.
  markAppHydrationAuthResolved: () =>
    set((state) => ({
      isAppDataLoading:  false,
      appHydrationState: state.appHydrationState === 'loading' ? 'idle' : state.appHydrationState,
    })),
}));

import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { mockSeed } from '@/mock';
import type { AppUser, Household, PointsBalance, Reward, Task } from '@/types';

export interface AppState {
  // ChoreHero app profile — set when Supabase DB profile is loaded
  user:             AppUser | null;
  household:        Household | null;
  tasks:            Task[];
  rewards:          Reward[];
  pointsBalances:   PointsBalance[];
  isMockHydrated:   boolean;

  // Supabase auth identity — managed exclusively by AuthBootstrap
  authSession:      Session | null;
  authUser:         User | null;
  isAuthResolved:   boolean;
  isAuthLoading:    boolean;
  authError:        string | null;
}

interface AppActions {
  // Mock / app data
  setUser:              (user: AppUser | null) => void;
  setHousehold:         (household: Household | null) => void;
  setTasks:             (tasks: Task[]) => void;
  setRewards:           (rewards: Reward[]) => void;
  setPointsBalances:    (balances: PointsBalance[]) => void;
  hydrateFromMockSeed:  () => void;
  resetAppState:        () => void;

  // Auth — only AuthBootstrap should call these
  applyAuthSession:     (session: Session | null) => void;
  clearAuthSession:     () => void;
  setAuthLoading:       (isLoading: boolean) => void;
  setAuthError:         (error: string | null) => void;
  markAuthResolved:     () => void;
}

export type AppStore = AppState & AppActions;

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
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,

  // ── App data actions ────────────────────────────────────────────────────────

  setUser:           (user)     => set({ user }),
  setHousehold:      (household) => set({ household }),
  setTasks:          (tasks)    => set({ tasks }),
  setRewards:        (rewards)  => set({ rewards }),
  setPointsBalances: (balances) => set({ pointsBalances: balances }),

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

  // ── Auth actions (AuthBootstrap is the sole caller) ─────────────────────────

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
}));

import { create } from 'zustand';
import { mockSeed } from '@/mock';
import type { AppUser, Household, PointsBalance, Reward, Task } from '@/types';

export interface AppState {
  user:            AppUser | null;
  household:       Household | null;
  tasks:           Task[];
  rewards:         Reward[];
  pointsBalances:  PointsBalance[];
  isMockHydrated:  boolean;
}

interface AppActions {
  setUser:             (user: AppUser | null) => void;
  setHousehold:        (household: Household | null) => void;
  setTasks:            (tasks: Task[]) => void;
  setRewards:          (rewards: Reward[]) => void;
  setPointsBalances:   (balances: PointsBalance[]) => void;
  hydrateFromMockSeed: () => void;
  resetAppState:       () => void;
}

export type AppStore = AppState & AppActions;

const initialState: AppState = {
  user:           null,
  household:      null,
  tasks:          [],
  rewards:        [],
  pointsBalances: [],
  isMockHydrated: false,
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,

  setUser:           (user)     => set({ user }),
  setHousehold:      (household)=> set({ household }),
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
}));

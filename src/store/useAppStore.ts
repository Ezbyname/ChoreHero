import { create } from 'zustand';
import type { AppState, AppUser, Household, Task } from '@/store/types';

interface AppActions {
  setUser:         (user: AppUser | null) => void;
  setHousehold:    (household: Household | null) => void;
  setTasks:        (tasks: Task[]) => void;
  resetAppState:   () => void;
}

type AppStore = AppState & AppActions;

const initialState: AppState = {
  user:      null,
  household: null,
  tasks:     [],
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,

  setUser:       (user)      => set({ user }),
  setHousehold:  (household) => set({ household }),
  setTasks:      (tasks)     => set({ tasks }),
  resetAppState: ()          => set(initialState),
}));

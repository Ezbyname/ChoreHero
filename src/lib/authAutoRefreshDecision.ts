// Pure decision logic for native AppState-driven Supabase auto-refresh —
// deliberately has no `react-native` import at all, not even a type-only
// one, so it (and its test) never touch the native module boundary.
// AppStateStatusLike mirrors React Native's real AppStateStatus values
// without importing that type.
export type AppStateStatusLike = 'active' | 'background' | 'inactive' | 'extension' | 'unknown';

export function resolveAutoRefreshAction(state: AppStateStatusLike): 'start' | 'stop' {
  return state === 'active' ? 'start' : 'stop';
}

import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { resolveAutoRefreshAction } from './authAutoRefreshDecision';

// Native-only — Metro-resolved in place of authAutoRefreshLifecycle.ts on
// iOS/Android; the plain Node unit-test runner can never resolve to this
// file (same `.native.ts` exclusion as supabaseAuthStorage.native.ts).
//
// Thin adapter only: AppState event -> pure decision (authAutoRefreshDecision.ts)
// -> Supabase start/stop call. The invariant this must uphold is "at most one
// live AppState subscription at any time, with deterministic cleanup on
// unmount/remount" — not "registered exactly once ever," which React
// StrictMode's deliberate mount/cleanup/remount cycle would violate as a claim.
// The caller (AuthBootstrap) owns exactly one call to this per its own single
// effect lifecycle, and this function's returned cleanup removes the
// subscription created by that same call.
export function registerAutoRefreshLifecycle(): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (!supabase) return;
    const action = resolveAutoRefreshAction(state);
    if (action === 'start') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
  return () => sub.remove();
}

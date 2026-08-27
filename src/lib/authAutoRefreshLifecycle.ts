// Web/default — no-op. AppState-driven pause/resume of Supabase's token
// auto-refresh applies only on native; see authAutoRefreshLifecycle.native.ts.
// This bare file is what Web bundling and the plain Node unit-test runner
// both resolve to.
export function registerAutoRefreshLifecycle(): () => void {
  return () => {};
}

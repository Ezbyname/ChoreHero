// Bare/Web variant. "Exiting" the recovery UI on Web is the existing,
// unchanged mechanism: a full page reload back to this app's own root.
// Product Decision A (remain authenticated after a successful reset) is
// already what this produces today — Supabase's persisted session survives
// the reload, so the reload lands the user in the normal authenticated
// boot, not a login screen. The `closeRecoveryState` argument exists only
// for the native variant's shape; Web ignores it, since a reload makes any
// local React state moot anyway.
export function useAuthRecoveryExit(_closeRecoveryState: () => void): () => void {
  return () => {
    if (typeof window !== 'undefined') {
      window.location.href = window.location.origin;
    }
  };
}

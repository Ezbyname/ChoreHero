// Native variant (Metro-only — see useAuthRecoveryExit.ts). There is no
// page-reload concept on native, so "exiting" recovery mode is a plain
// local-state transition owned by AppBootstrap.tsx: clearing its recovery
// state falls through to the normal authenticated boot (AuthBootstrap sees
// the still-valid session — Product Decision A — via the ordinary
// INITIAL_SESSION/SIGNED_IN path, same as any other app launch).
export function useAuthRecoveryExit(closeRecoveryState: () => void): () => void {
  return closeRecoveryState;
}

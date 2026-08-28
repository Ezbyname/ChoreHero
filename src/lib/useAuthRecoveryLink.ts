// Bare/Web variant. Web has its own, already-working redirect mechanism
// (authRedirectDetection.ts / authRedirectCapture.ts, captured synchronously
// at module-eval time) — this hook exists purely so AppBootstrap.tsx can
// call one unconditional hook regardless of platform without importing
// expo-linking (a native module) into a shared file. On Web it always
// reports "no incoming native URL," which is correct: Web never receives
// one through this path.
export function useAuthRecoveryLink(): string | null {
  return null;
}

// No-op on Web — nothing was ever cached to clear.
export function clearAuthRecoveryLink(): void {}

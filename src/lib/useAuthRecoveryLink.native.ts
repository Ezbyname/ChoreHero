// Native variant (Metro-only — see useAuthRecoveryLink.ts). expo-linking's
// useLinkingURL() is the single Expo-documented mechanism that reports both
// the cold-start launch URL (a synchronous native-module read, no await
// needed — see its own source) and any subsequent "warm start" URL received
// while the app is already running, through one piece of state. That's
// exactly why it's used here instead of separately wiring
// Linking.getInitialURL() + Linking.addEventListener('url', ...) by hand.
import { clearInitialURL, useLinkingURL } from 'expo-linking';

export function useAuthRecoveryLink(): string | null {
  return useLinkingURL();
}

// Called once an incoming URL has been fully processed, so a later
// re-render/remount can't reprocess the same stale link.
export function clearAuthRecoveryLink(): void {
  clearInitialURL();
}

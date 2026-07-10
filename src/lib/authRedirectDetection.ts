import { Platform } from 'react-native';

// Captured at module-evaluation time — before Supabase's client is
// constructed (see index.ts, which imports this file first) — because
// supabase-js processes and strips these URL markers asynchronously via
// history.replaceState once it detects a session. Reading them later (e.g.
// inside a component's render) risks losing the race and seeing an already-
// cleaned URL.
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const capturedHash   = isWeb ? window.location.hash   : '';
const capturedSearch = isWeb ? window.location.search : '';

// True when this page load is a landing from a Supabase auth email link
// (signup confirmation, magic link, invite, password recovery) — covers
// both the implicit flow (#access_token=...&type=...) and the PKCE flow
// (?code=...).
export function hasAuthRedirectMarkers(): boolean {
  return (
    /access_token=|type=(signup|recovery|invite|magiclink)/.test(capturedHash) ||
    /[?&]code=/.test(capturedSearch)
  );
}

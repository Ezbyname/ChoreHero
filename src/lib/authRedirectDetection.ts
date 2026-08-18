// Captured at module-evaluation time — before Supabase's client is
// constructed (see index.ts, which imports this file first) — because
// supabase-js processes and strips these URL markers asynchronously via
// history.replaceState once it detects a session. Reading them later (e.g.
// inside a component's render) risks losing the race and seeing an already-
// cleaned URL.
//
// `typeof window !== 'undefined'` is web-only in this Expo app (iOS/Android
// have no `window` global) — equivalent to the previous `Platform.OS ===
// 'web'` check, without importing react-native's `Platform`. That import is
// deliberately avoided: react-native's entry point uses Flow syntax that
// only Metro/Babel can parse, so importing it here would break this module
// under the plain Node `node:test` runner used for unit tests.
const isWeb = typeof window !== 'undefined';
const capturedHash   = isWeb ? window.location.hash   : '';
const capturedSearch = isWeb ? window.location.search : '';

export type AuthRedirectResult =
  | { type: 'none' }
  | { type: 'other' }
  | { type: 'recovery' }
  | { type: 'error'; errorCode: string | undefined };

// Pure function (hash/search passed in) so it's unit-testable without
// touching window.location — the module-level constants above are the
// only place real browser state enters this file.
export function classifyAuthRedirect(hash: string, search: string): AuthRedirectResult {
  // Supabase's documented behavior for an expired/invalid/already-used
  // email link is a redirect carrying error=/error_code=/error_description=
  // instead of access_token=/type=. Checked first: an error marker always
  // wins over a type= marker that might also be present.
  if (/error=/.test(hash) || /error=/.test(search)) {
    const match = /error_code=([^&]+)/.exec(hash) ?? /error_code=([^&]+)/.exec(search);
    return { type: 'error', errorCode: match?.[1] };
  }

  if (/type=recovery/.test(hash) || /type=recovery/.test(search)) {
    return { type: 'recovery' };
  }

  if (
    /access_token=|type=(signup|invite|magiclink)/.test(hash) ||
    /[?&]code=/.test(search)
  ) {
    return { type: 'other' };
  }

  return { type: 'none' };
}

export function getAuthRedirectResult(): AuthRedirectResult {
  return classifyAuthRedirect(capturedHash, capturedSearch);
}

// Retained for any other existing call site during the transition —
// AppBootstrap.tsx (Task 3) stops using this and calls
// getAuthRedirectResult() directly instead.
export function hasAuthRedirectMarkers(): boolean {
  return getAuthRedirectResult().type !== 'none';
}

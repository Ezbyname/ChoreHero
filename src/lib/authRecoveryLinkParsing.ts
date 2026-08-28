// Pure, platform-neutral. Turns a raw incoming URL string (as delivered by
// expo-linking on native — a custom-scheme URL, not a window.location) into
// the same {hash, search} shape authRedirectDetection.ts's
// classifyAuthRedirect() already expects and is already tested against —
// deliberately reused rather than duplicated. Hand-rolled string splitting
// instead of the URL/URLSearchParams polyfill's own parser, to keep this
// module free of any import-order dependency on react-native-url-polyfill
// and directly unit-testable under plain Node.

export function parseLinkingUrl(url: string): { hash: string; search: string } {
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex); // includes leading '#', matching window.location.hash's convention

  const searchIndex = beforeHash.indexOf('?');
  const search = searchIndex === -1 ? '' : beforeHash.slice(searchIndex); // includes leading '?', matching window.location.search's convention

  return { hash, search };
}

export type RecoveryTokens = { accessToken: string; refreshToken: string };

// Extracts the two tokens the installed (implicit-flow) Supabase client
// needs for setSession() from a recovery hash fragment. Returns null if
// either is missing/malformed — callers must treat that as a failure to
// establish a session, not a partial session.
export function extractRecoveryTokens(hash: string): RecoveryTokens | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

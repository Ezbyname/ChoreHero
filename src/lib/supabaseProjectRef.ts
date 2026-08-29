// Extracted from config/appVariant.ts (build-time-only) so this pure
// project-ref logic has exactly one definition reachable from both worlds:
// config/appVariant.ts (Expo config resolution, via app.config.ts) and
// runtime application code under src/ (e.g. runtimeBuildInfo.ts), which
// must never import config/appVariant.ts itself — see that file's own
// comment for why. Behavior is unchanged from its original definition in
// appVariant.ts; only its location moved, and appVariant.ts re-exports
// extractProjectRef so its existing public API is unaffected.

// Not secrets — a Supabase project ref is the subdomain segment of that
// project's own public URL. No credential of any kind lives in this file.
export const QA_PROJECT_REF = 'umzfyedxnvtmfnwldwtq';
export const PRODUCTION_PROJECT_REF = 'aqjiweueckwnkczcyedu';

// Returns the project ref (the subdomain segment) for a well-formed
// https://<ref>.supabase.co URL, or null for anything else — missing,
// unparsable, wrong host suffix, or a ref containing characters outside
// [a-z0-9]. Never throws.
export function extractProjectRef(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;

  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return null;
  }

  const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  return match ? match[1].toLowerCase() : null;
}

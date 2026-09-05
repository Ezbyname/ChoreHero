// Pure, network-free target validation for the Rewards Redemption QA
// fixture script. Kept as its own module specifically so it can be
// exercised by scripts/validate-qa-target-guard.mjs without ever creating
// a Supabase client or making a request — the guard itself must be provable
// without network access, and this is what makes that possible.

// Not secret — the project ref is visible in the project's own public URL.
// A positive allowlist of exactly one ref (no Production ref included here
// or anywhere in this repo).
export const APPROVED_QA_PROJECT_REF = 'umzfyedxnvtmfnwldwtq';

// Returns the project ref (the subdomain segment) for a well-formed
// https://<ref>.supabase.co URL, or null for anything else — missing,
// unparsable, wrong host suffix, or a ref containing characters outside
// [a-z0-9]. Never throws.
export function extractProjectRef(supabaseUrl) {
  if (!supabaseUrl || typeof supabaseUrl !== 'string') return null;

  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return null;
  }

  const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  return match ? match[1].toLowerCase() : null;
}

// The single fail-closed gate: returns { ok: true } only when the target
// is unambiguously the approved QA project AND the explicit opt-in flag is
// exactly the string 'true'. Every other input — missing/malformed URL,
// any other project (including Production), the flag absent, or the flag
// set to anything other than 'true' — returns { ok: false, reason }.
export function validateQaTarget(supabaseUrl, allowFlag) {
  const ref = extractProjectRef(supabaseUrl);

  if (!ref) {
    return {
      ok: false,
      reason: `SUPABASE_URL is missing or not a well-formed https://<ref>.supabase.co URL (got: ${JSON.stringify(supabaseUrl ?? null)}).`,
    };
  }

  if (ref !== APPROVED_QA_PROJECT_REF) {
    return {
      ok: false,
      reason: `SUPABASE_URL's project ref ("${ref}") is not the approved QA project ref ("${APPROVED_QA_PROJECT_REF}"). Refusing to touch any other project.`,
    };
  }

  if (allowFlag !== 'true') {
    return {
      ok: false,
      reason: 'ALLOW_REWARDS_REDEMPTION_QA_SEED is not set to exactly "true".',
    };
  }

  return { ok: true };
}

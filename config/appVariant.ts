// Build-time only. Resolves the requested Android/iOS/Web application
// variant (development / qa / production) into its identity — display
// name, package/bundle identifiers, URL scheme — and validates that the
// actual resolved Supabase backend target matches what that variant is
// approved to talk to. Imported only by app.config.ts (during Expo/EAS
// config resolution) and by src/lib/__tests__/appVariant.test.ts.
//
// Runtime application code (src/) must never import this — it never ships
// inside the RN bundle.

// QA-01 — Runtime Build Identification. The project-ref constants and
// extractProjectRef live in src/lib/supabaseProjectRef.ts, not here, so
// runtime code (src/) can reach them without importing this build-time-
// only file — re-exported below so this file's own public API (and the
// existing appVariant.test.ts imports) are unaffected by the move.
import { QA_PROJECT_REF, PRODUCTION_PROJECT_REF, extractProjectRef } from '../src/lib/supabaseProjectRef';
export { extractProjectRef };

export type AppVariant = 'development' | 'qa' | 'production';

const APP_VARIANTS: readonly AppVariant[] = ['development', 'qa', 'production'];

export type VariantIdentity = {
  name: string;
  androidPackage: string;
  iosBundleIdentifier: string;
  scheme: string;
  expectedBackendProjectRef: string;
};

// One identity record per variant, feeding both Android and iOS from the
// same source so the two platforms can never drift apart.
const VARIANT_IDENTITIES: Record<AppVariant, VariantIdentity> = {
  development: {
    name: 'ChoreHero Dev',
    androidPackage: 'com.ezbyname.chorehero.dev',
    iosBundleIdentifier: 'com.ezbyname.chorehero.dev',
    scheme: 'chorehero-dev',
    expectedBackendProjectRef: QA_PROJECT_REF,
  },
  qa: {
    name: 'ChoreHero QA',
    androidPackage: 'com.ezbyname.chorehero.qa',
    iosBundleIdentifier: 'com.ezbyname.chorehero.qa',
    scheme: 'chorehero-qa',
    expectedBackendProjectRef: QA_PROJECT_REF,
  },
  production: {
    name: 'ChoreHero',
    androidPackage: 'com.ezbyname.chorehero',
    iosBundleIdentifier: 'com.ezbyname.chorehero',
    scheme: 'chorehero',
    expectedBackendProjectRef: PRODUCTION_PROJECT_REF,
  },
};

export type VariantResolution = { ok: true; variant: AppVariant } | { ok: false; reason: string };

// Callers handle an absent/empty APP_VARIANT themselves (as passthrough) —
// this only runs once a non-empty value exists, so it fails closed on
// anything that isn't one of the three exact approved names. No case
// normalization: "QA" or "Production" are rejected, not coerced.
export function resolveVariant(raw: string): VariantResolution {
  if ((APP_VARIANTS as readonly string[]).includes(raw)) {
    return { ok: true, variant: raw as AppVariant };
  }
  return {
    ok: false,
    reason: `APP_VARIANT must be one of ${APP_VARIANTS.join(', ')} (got: ${JSON.stringify(raw)}).`,
  };
}

export function getVariantIdentity(variant: AppVariant): VariantIdentity {
  return VARIANT_IDENTITIES[variant];
}

export type TargetValidation = { ok: true } | { ok: false; reason: string };

// The hard build-time guard: compares the ACTUAL resolved backend (from the
// real EXPO_PUBLIC_SUPABASE_URL) against the variant's approved project ref.
// Never trusts APP_VARIANT alone — that only says what was intended.
export function validateBackendTarget(
  variant: AppVariant,
  resolvedSupabaseUrl: string | undefined,
): TargetValidation {
  const identity = getVariantIdentity(variant);
  const ref = extractProjectRef(resolvedSupabaseUrl);

  if (!ref) {
    return {
      ok: false,
      reason: `EXPO_PUBLIC_SUPABASE_URL is missing or not a well-formed https://<ref>.supabase.co URL (got: ${JSON.stringify(resolvedSupabaseUrl ?? null)}).`,
    };
  }

  if (ref !== identity.expectedBackendProjectRef) {
    return {
      ok: false,
      reason: `APP_VARIANT="${variant}" expects Supabase project "${identity.expectedBackendProjectRef}", but the resolved EXPO_PUBLIC_SUPABASE_URL points at project "${ref}". Refusing to build ${variant} against the wrong backend.`,
    };
  }

  return { ok: true };
}

import { QA_PROJECT_REF, PRODUCTION_PROJECT_REF, extractProjectRef } from '@/lib/supabaseProjectRef';

// QA-01 — Runtime Build Identification. Observability only — nothing in
// this module or its consumers (About screen, QA badge, copy action) may
// influence auth, routing, backend selection, or any other app behavior.
//
// This file is deliberately kept free of any import that isn't safe under
// this repo's plain Node test runner (scripts/test/aliasLoader.mjs) — in
// particular, no `expo-application` import here. expo-application is a
// native module whose platform-specific implementation file only resolves
// correctly through Metro's platform-extension resolution; importing it
// (even transitively) breaks every test that reaches this file (confirmed
// empirically: ERR_MODULE_NOT_FOUND for ExpoApplication.ts, the bare
// filename Metro's resolver would otherwise pick a platform variant for).
// The real, native-touching singleton lives in currentBuildInfo.ts
// instead — this file only exports pure, explicitly-parameterized logic.
//
// Backend classification is derived independently from the actual
// resolved EXPO_PUBLIC_SUPABASE_URL (reusing config/appVariant.ts's own
// project-ref logic via the shared src/lib/supabaseProjectRef.ts — never
// importing config/appVariant.ts itself, which is build-time-only and
// must never ship in the runtime bundle), not copied from appVariant —
// so a real mismatch between intended variant and actual backend would
// show up here rather than being silently hidden.
export type BackendTarget = 'QA' | 'PRODUCTION' | 'MOCK' | 'UNKNOWN';

export interface RuntimeBuildInfo {
  appName:          string;
  appVersion:       string;
  displayVersion:   string;
  buildNumber:      string;
  appVariant:       string | null;
  environmentLabel: string;
  gitSha:           string;
  shortGitSha:      string;
  backendTarget:    BackendTarget;
}

export function classifyBackendTarget(resolvedSupabaseUrl: string | undefined): BackendTarget {
  if (!resolvedSupabaseUrl) return 'MOCK';

  const ref = extractProjectRef(resolvedSupabaseUrl);
  if (ref === QA_PROJECT_REF) return 'QA';
  if (ref === PRODUCTION_PROJECT_REF) return 'PRODUCTION';
  return 'UNKNOWN';
}

function labelForBackend(backend: BackendTarget): string {
  switch (backend) {
    case 'QA':         return 'QA';
    case 'PRODUCTION': return 'Production';
    case 'MOCK':       return 'Mock';
    case 'UNKNOWN':    return 'Unknown';
  }
}

function appNameForVariant(variant: string | null): string {
  if (variant === 'qa')          return 'ChoreHero QA';
  if (variant === 'development') return 'ChoreHero Dev';
  return 'ChoreHero';
}

// variant-suffix presentation only — never a second semantic version.
// "1.0.0" (production/unset) / "1.0.0 QA" / "1.0.0 Dev".
function displayVersionForVariant(appVersion: string, variant: string | null): string {
  if (variant === 'qa')          return `${appVersion} QA`;
  if (variant === 'development') return `${appVersion} Dev`;
  return appVersion;
}

// environmentLabel prefers appVariant when the build actually set one
// (always true for a real EAS build, per app.config.ts's fail-closed
// backend-target guard — variant and backend can never disagree there).
// It falls back to the independently-derived backend classification when
// appVariant is unset — the real case today for the live Vercel Web
// build and for local/mock dev, neither of which ever sets APP_VARIANT
// (see app.config.ts's own passthrough comment) — so Environment is
// still a true statement rather than blank.
function environmentLabelFor(variant: string | null, backend: BackendTarget): string {
  if (variant === 'qa')          return 'QA';
  if (variant === 'production')  return 'Production';
  if (variant === 'development') return 'Development';
  return labelForBackend(backend);
}

export interface RuntimeBuildInfoInput {
  appVersion:         string | undefined;
  appVariant:         string | undefined;
  // QA-01.2 — the real native artifact identifier (Android versionCode /
  // iOS CFBundleVersion), read once per app launch from expo-application.
  // Always null on Web — see resolveBuildNumber's own comment for why
  // that must never be papered over with a fabricated number.
  nativeBuildVersion: string | null;
  buildNumber:        string | undefined;
  gitSha:             string | undefined;
  supabaseUrl:        string | undefined;
}

// QA-01.2 — Build field priority: the real installed native artifact
// number (Application.nativeBuildVersion) first — it reflects the binary
// actually running, not a value baked in at bundle time — then the
// EXPO_PUBLIC_BUILD_NUMBER channel (kept for architectural symmetry with
// the other EXPO_PUBLIC_* fields, though nothing currently sets it), then
// 'local'. Web's nativeBuildVersion is always null (no native artifact to
// report), so Web/local dev correctly falls through to 'local' rather
// than ever fabricating a number — see runtimeBuildInfo.test.ts's
// "Web does not fabricate a numeric native build" case.
function resolveBuildNumber(nativeBuildVersion: string | null, fallback: string | undefined): string {
  if (nativeBuildVersion) return nativeBuildVersion;
  return fallback?.trim() || 'local';
}

// Pure — takes its raw inputs explicitly rather than reading
// process.env/imports internally, so it's directly testable with
// synthetic values (matching this repo's established convention, e.g.
// sortRewardsForDisplay). The real singleton below supplies the actual
// build-time-inlined/native values.
export function buildRuntimeBuildInfo(input: RuntimeBuildInfoInput): RuntimeBuildInfo {
  const backendTarget = classifyBackendTarget(input.supabaseUrl);
  const appVersion    = input.appVersion?.trim() || 'unknown';
  const variant        = input.appVariant?.trim() || null;
  const rawSha          = input.gitSha?.trim();

  return {
    appName:          appNameForVariant(variant),
    appVersion,
    displayVersion:   displayVersionForVariant(appVersion, variant),
    buildNumber:      resolveBuildNumber(input.nativeBuildVersion, input.buildNumber),
    appVariant:       variant,
    environmentLabel: environmentLabelFor(variant, backendTarget),
    gitSha:           rawSha || 'unknown',
    shortGitSha:       rawSha ? rawSha.slice(0, 7) : 'unknown',
    backendTarget,
  };
}

// Layer A (quick identification) — "QA • v1.0.0 • b28" for a real numeric
// build, but "QA • v1.0.0 • local" (no "b" prefix) for the 'local'/
// 'unknown' fallback strings, where "b" + "local" would otherwise read as
// the confusing, unintended word "blocal".
export function formatQaBadgeText(info: RuntimeBuildInfo): string {
  const buildSuffix = /^\d+$/.test(info.buildNumber) ? `b${info.buildNumber}` : info.buildNumber;
  return `QA • v${info.appVersion} • ${buildSuffix}`;
}

export function formatBuildInfoForCopy(info: RuntimeBuildInfo): string {
  return [
    info.appName,
    `Version: ${info.displayVersion}`,
    `Build: ${info.buildNumber}`,
    `Environment: ${info.environmentLabel}`,
    `Commit: ${info.shortGitSha}`,
    `Backend: ${info.backendTarget}`,
  ].join('\n');
}

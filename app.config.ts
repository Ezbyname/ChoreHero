// Dynamic Expo config. Registers tsx's CommonJS require hook FIRST — this
// is the documented, Node-version-independent mechanism for importing an
// additional TypeScript module (./config/appVariant) from a dynamic Expo
// config; it is not this repo's TS-execution strategy in general (see
// scripts/test/register.mjs for the separate, unrelated unit-test loader),
// only app.config.ts's own need to pull in build-time-only logic.
import 'tsx/cjs';

import { execSync } from 'node:child_process';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { getVariantIdentity, resolveVariant, validateBackendTarget } from './config/appVariant';
import pkg from './package.json';

// QA-01 — Runtime Build Identification. Resolved once per config
// evaluation, at build/export/start time (this whole file is build-time
// only, same rule as config/appVariant.ts) — never shelled out to from
// runtime application code. Failure (no .git present, e.g. a tarball-only
// build environment, or git unavailable) is expected and safe: falls
// back to undefined here, which src/lib/runtimeBuildInfo.ts turns into
// 'unknown' rather than crashing or fabricating a value.
function resolveGitSha(): string | undefined {
  try {
    const sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}

// Applies unconditionally — including the passthrough path below where
// no APP_VARIANT is set (the live Vercel Web build, local `expo start`)
// — so every artifact can show its real Product version and source
// revision, not just the ones that go through variant resolution.
// package.json remains the sole authoritative version source: this reads
// it once and derives both the Expo config's own `version` field and the
// runtime-safe EXPO_PUBLIC_APP_VERSION from the same value, so nobody has
// to manually keep two version numbers in sync.
process.env.EXPO_PUBLIC_APP_VERSION = pkg.version;
const gitSha = resolveGitSha();
if (gitSha) {
  process.env.EXPO_PUBLIC_GIT_SHA = gitSha;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const rawVariant = process.env.APP_VARIANT;

  // Absent/empty APP_VARIANT: pure passthrough. Nothing today — not the
  // live Vercel Web build, not local `expo start`/`expo start --web` —
  // sets APP_VARIANT, so returning `config` unchanged (aside from the
  // version fields above) is the only option that cannot break that
  // already-shipped behavior. This is deliberate, not an oversight: see
  // the N1.4 design record for why neither "fail" nor "default to
  // development" is safe here.
  if (!rawVariant) {
    return { ...config, version: pkg.version } as ExpoConfig;
  }

  const variantResult = resolveVariant(rawVariant);
  if (!variantResult.ok) {
    throw new Error(`[app.config.ts] ${variantResult.reason}`);
  }

  const targetResult = validateBackendTarget(variantResult.variant, process.env.EXPO_PUBLIC_SUPABASE_URL);
  if (!targetResult.ok) {
    throw new Error(`[app.config.ts] Backend target guard failed: ${targetResult.reason}`);
  }

  const identity = getVariantIdentity(variantResult.variant);

  // Derived, never independently set — the build-time-only single source
  // of truth (APP_VARIANT, already resolved and guard-validated above)
  // is what Metro's EXPO_PUBLIC_* inlining picks up here, not a second,
  // separately-maintained value that could silently disagree with it.
  process.env.EXPO_PUBLIC_APP_VARIANT = variantResult.variant;

  return {
    ...config,
    name: identity.name,
    version: pkg.version,
    scheme: identity.scheme,
    android: { ...config.android, package: identity.androidPackage },
    ios: { ...config.ios, bundleIdentifier: identity.iosBundleIdentifier },
  } as ExpoConfig;
};

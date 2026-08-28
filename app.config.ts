// Dynamic Expo config. Registers tsx's CommonJS require hook FIRST — this
// is the documented, Node-version-independent mechanism for importing an
// additional TypeScript module (./config/appVariant) from a dynamic Expo
// config; it is not this repo's TS-execution strategy in general (see
// scripts/test/register.mjs for the separate, unrelated unit-test loader),
// only app.config.ts's own need to pull in build-time-only logic.
import 'tsx/cjs';

import type { ConfigContext, ExpoConfig } from 'expo/config';
import { getVariantIdentity, resolveVariant, validateBackendTarget } from './config/appVariant';

export default ({ config }: ConfigContext): ExpoConfig => {
  const rawVariant = process.env.APP_VARIANT;

  // Absent/empty APP_VARIANT: pure passthrough. Nothing today — not the
  // live Vercel Web build, not local `expo start`/`expo start --web` —
  // sets APP_VARIANT, so returning `config` unchanged is the only option
  // that cannot break that already-shipped behavior. This is deliberate,
  // not an oversight: see the N1.4 design record for why neither "fail"
  // nor "default to development" is safe here.
  if (!rawVariant) {
    return config as ExpoConfig;
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

  return {
    ...config,
    name: identity.name,
    scheme: identity.scheme,
    android: { ...config.android, package: identity.androidPackage },
    ios: { ...config.ios, bundleIdentifier: identity.iosBundleIdentifier },
  } as ExpoConfig;
};

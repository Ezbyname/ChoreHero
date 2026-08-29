import * as Application from 'expo-application';
import { buildRuntimeBuildInfo, type RuntimeBuildInfo } from '@/lib/runtimeBuildInfo';
import { supabaseUrl } from '@/lib/supabaseConfig';

// QA-01.2 — The actual, live singleton the app displays (About, QA badge,
// Copy build info all consume this one value). Kept in its own file,
// separate from runtimeBuildInfo.ts's pure logic, specifically because it
// imports expo-application — a native module that is not safe to import
// under this repo's plain Node test runner (see runtimeBuildInfo.ts's own
// comment for the empirically-confirmed reason). No test imports this
// file; every test exercises the pure buildRuntimeBuildInfo function
// directly with synthetic inputs instead.
//
// Built once at module load from the real build-time-inlined
// EXPO_PUBLIC_* values (set in app.config.ts), the already-runtime-safe
// supabaseUrl (src/lib/supabaseConfig.ts), and the real native artifact
// identifier (Application.nativeBuildVersion — null on Web).
export const currentBuildInfo: RuntimeBuildInfo = buildRuntimeBuildInfo({
  appVersion:         process.env.EXPO_PUBLIC_APP_VERSION,
  appVariant:         process.env.EXPO_PUBLIC_APP_VARIANT,
  nativeBuildVersion: Application.nativeBuildVersion,
  buildNumber:        process.env.EXPO_PUBLIC_BUILD_NUMBER,
  gitSha:             process.env.EXPO_PUBLIC_GIT_SHA,
  supabaseUrl,
});

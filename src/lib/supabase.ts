import './supabaseNativeSetup';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from '@/lib/supabaseConfig';
import { supabaseAuthStorageOptions } from '@/lib/supabaseAuthStorage';
import type { Database } from '@/types/supabase';

// `typeof window !== 'undefined'` is web-only in this Expo app (iOS/Android
// have no `window` global) — the same idiom src/lib/authRedirectDetection.ts
// already uses, for the same reason: it avoids importing react-native's
// `Platform`, which would break under this project's plain-Node unit-test
// runner (react-native's entry point uses Flow syntax only Metro/Babel can
// parse).
const isWeb = typeof window !== 'undefined';

// Client is null when env vars are missing.
// Use isSupabaseConfigured before calling Supabase APIs.
//
// auth.storage: supabaseAuthStorageOptions spreads in a native persistent
// storage adapter (AsyncStorage) on iOS/Android, and nothing at all on Web
// (Supabase's own browser storage default applies) — see
// supabaseAuthStorage.ts / .native.ts for why this is a platform-file split
// rather than a runtime branch.
//
// detectSessionInUrl: true on Web only. AppBootstrap.tsx's own redirect
// classification (getAuthRedirectResult) decides which screen to render
// independently of this flag, but the underlying session for password
// recovery / email confirmation still needs Supabase's own URL parsing to
// produce a real session — that's what this flag controls. Native has no
// browser URL to parse from, so it stays false there.
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        ...supabaseAuthStorageOptions,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: isWeb,
      },
    })
  : null;

import './supabaseNativeSetup';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from '@/lib/supabaseConfig';
import { supabaseAuthStorageOptions } from '@/lib/supabaseAuthStorage';
import { detectSessionInUrl } from '@/lib/supabaseAuthPlatform';
import type { Database } from '@/types/supabase';

// Client is null when env vars are missing.
// Use isSupabaseConfigured before calling Supabase APIs.
//
// auth.storage: supabaseAuthStorageOptions spreads in a native persistent
// storage adapter (AsyncStorage) on iOS/Android, and nothing at all on Web
// (Supabase's own browser storage default applies) — see
// supabaseAuthStorage.ts / .native.ts for why this is a platform-file split
// rather than a runtime branch.
//
// detectSessionInUrl: true on Web only (see supabaseAuthPlatform.ts /
// .native.ts — a platform-file split, not a runtime `window` check; see
// that file's comment for why). AppBootstrap.tsx's own redirect
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
        detectSessionInUrl,
      },
    })
  : null;

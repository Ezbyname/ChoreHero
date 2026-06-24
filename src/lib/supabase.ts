import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from '@/lib/supabaseConfig';
import type { Database } from '@/types/supabase';

// Client is null when env vars are missing.
// Use isSupabaseConfigured before calling Supabase APIs.
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseKey)
  : null;

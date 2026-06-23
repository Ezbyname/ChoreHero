import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from '@/lib/supabaseConfig';

// Client is null when env vars are missing.
// Use isSupabaseConfigured before calling Supabase APIs.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;

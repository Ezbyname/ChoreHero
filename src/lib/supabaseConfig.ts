export type SupabaseConfigStatus = 'missing' | 'partial' | 'ready';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

const hasUrl = url.length > 0;
const hasKey = key.length > 0;

export const supabaseConfigStatus: SupabaseConfigStatus =
  hasUrl && hasKey ? 'ready'   :
  hasUrl || hasKey ? 'partial' :
  'missing';

export const isSupabaseConfigured = supabaseConfigStatus === 'ready';

export const supabaseUrl  = url;
export const supabaseKey  = key;

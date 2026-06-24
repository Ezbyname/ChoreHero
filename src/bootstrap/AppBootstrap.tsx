import React from 'react';
import { AuthBootstrap } from '@/bootstrap/AuthBootstrap';
import { AppDataBootstrap } from '@/bootstrap/AppDataBootstrap';
import { AuthGate } from '@/navigation/AuthGate';
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';

// AppBootstrap is the root of the non-navigation tree.
// Rendering order:
//   AuthBootstrap — subscribes to Supabase auth; sets auth state in store
//   AppDataBootstrap — reacts to auth state; runs Supabase DB hydration
//   AuthGate — pure renderer; reads store state; shows correct navigator

export function AppBootstrap() {
  const isMockHydrated      = useAppStore((s) => s.isMockHydrated);
  const hydrateFromMockSeed = useAppStore((s) => s.hydrateFromMockSeed);

  // Mock seed hydration runs only in dev/mock mode (no Supabase credentials).
  // When Supabase is configured, AppDataBootstrap handles all data loading.
  React.useEffect(() => {
    if (!isSupabaseConfigured && !isMockHydrated) {
      hydrateFromMockSeed();
    }
  }, []);

  return (
    <AuthBootstrap>
      <AppDataBootstrap>
        <AuthGate />
      </AppDataBootstrap>
    </AuthBootstrap>
  );
}

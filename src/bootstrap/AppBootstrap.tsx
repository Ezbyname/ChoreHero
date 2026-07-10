import React from 'react';
import { AuthBootstrap } from '@/bootstrap/AuthBootstrap';
import { AppDataBootstrap } from '@/bootstrap/AppDataBootstrap';
import { AuthGate } from '@/navigation/AuthGate';
import { useAppStore } from '@/store/useAppStore';
import { hasAuthRedirectMarkers } from '@/lib/authRedirectDetection';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { EmailConfirmedScreen } from '@/screens/EmailConfirmedScreen';

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

  // This tab landed directly from a Supabase auth email link (signup
  // confirmation, magic link, invite, recovery). Supabase's client still
  // establishes a session here as a side effect, but this tab is not where
  // the user actually signs in — show a static confirmation instead of
  // booting the full authenticated app flow for it.
  if (hasAuthRedirectMarkers()) {
    return <EmailConfirmedScreen />;
  }

  return (
    <AuthBootstrap>
      <AppDataBootstrap>
        <AuthGate />
      </AppDataBootstrap>
    </AuthBootstrap>
  );
}

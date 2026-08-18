import React from 'react';
import { AuthBootstrap } from '@/bootstrap/AuthBootstrap';
import { AppDataBootstrap } from '@/bootstrap/AppDataBootstrap';
import { AuthGate } from '@/navigation/AuthGate';
import { useAppStore } from '@/store/useAppStore';
import { getAuthRedirectResult } from '@/lib/authRedirectDetection';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { EmailConfirmedScreen } from '@/screens/EmailConfirmedScreen';
import { ResetPasswordScreen } from '@/screens/ResetPasswordScreen';
import { RecoveryLinkExpiredScreen } from '@/screens/RecoveryLinkExpiredScreen';

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

  // This tab landed directly from a Supabase auth email link. Which screen
  // it gets depends on which kind of link:
  //   'recovery' -> ResetPasswordScreen (the user can set a new password —
  //                 a real session already exists at this point; see that
  //                 screen's own comment for why)
  //   'error'    -> RecoveryLinkExpiredScreen (expired/invalid/used link —
  //                 previously this fell through to a normal, wrong app
  //                 boot; now it's classified and handled explicitly)
  //   'other'    -> EmailConfirmedScreen, unchanged (signup confirmation,
  //                 invite, magic link — this tab's session is incidental,
  //                 the user signs in for real on whichever device they
  //                 actually use ChoreHero from)
  //   'none'     -> falls through to the normal boot below, unchanged
  const redirectResult = getAuthRedirectResult();

  if (redirectResult.type === 'recovery') {
    return <ResetPasswordScreen />;
  }
  if (redirectResult.type === 'error') {
    return <RecoveryLinkExpiredScreen />;
  }
  if (redirectResult.type === 'other') {
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

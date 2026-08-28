import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthBootstrap } from '@/bootstrap/AuthBootstrap';
import { AppDataBootstrap } from '@/bootstrap/AppDataBootstrap';
import { AuthGate } from '@/navigation/AuthGate';
import { useAppStore } from '@/store/useAppStore';
import { classifyAuthRedirect, getAuthRedirectResult, type AuthRedirectResult } from '@/lib/authRedirectDetection';
import { clearAuthRecoveryLink, useAuthRecoveryLink } from '@/lib/useAuthRecoveryLink';
import { useAuthRecoveryExit } from '@/lib/useAuthRecoveryExit';
import { extractRecoveryTokens, parseLinkingUrl } from '@/lib/authRecoveryLinkParsing';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { colors } from '@/theme';
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

  // Web: unchanged from before N1.3. authRedirectCapture.ts captured the
  // hash/search synchronously at module-eval time, before Supabase's own
  // client-side auto-detect could strip them; this is a pure, synchronous
  // classification of that capture, re-evaluated each render but always
  // returning the same result for the lifetime of this tab. On native this
  // always reports 'none' (authRedirectCapture.native.ts never has a real
  // URL to read), which is why the native handling below is additive, not
  // a replacement.
  const webRedirectResult = getAuthRedirectResult();

  // Native: expo-linking's useLinkingURL() (see useAuthRecoveryLink.native.ts）
  // reports both the cold-start launch URL and any later "warm start" URL
  // received while already running, through one piece of state — always
  // null on Web. Supabase never auto-parses a native URL (GoTrueClient's
  // own session-from-URL detection is gated by isBrowser(), confirmed false
  // on native regardless of detectSessionInUrl), so unlike Web, establishing
  // a session from a recovery link is this app's own explicit responsibility
  // here, and must complete before ResetPasswordScreen can render.
  const nativeRecoveryUrl = useAuthRecoveryLink();
  const [nativeRecoveryResult, setNativeRecoveryResult] = React.useState<AuthRedirectResult | null>(null);
  const [isResolvingNativeRecovery, setIsResolvingNativeRecovery] = React.useState(false);

  React.useEffect(() => {
    if (!nativeRecoveryUrl) return;

    let cancelled = false;

    (async () => {
      const { hash, search } = parseLinkingUrl(nativeRecoveryUrl);
      const result = classifyAuthRedirect(hash, search);

      if (result.type === 'recovery') {
        setIsResolvingNativeRecovery(true);

        const tokens = extractRecoveryTokens(hash);
        const sessionEstablished =
          tokens && supabase
            ? (await supabase.auth.setSession({
                access_token:  tokens.accessToken,
                refresh_token: tokens.refreshToken,
              })).error === null
            : false;

        if (cancelled) return;
        setIsResolvingNativeRecovery(false);
        setNativeRecoveryResult(
          sessionEstablished ? result : { type: 'error', errorCode: 'session_establish_failed' },
        );
      } else if (result.type !== 'none') {
        setNativeRecoveryResult(result);
      }

      clearAuthRecoveryLink();
    })();

    return () => {
      cancelled = true;
    };
  }, [nativeRecoveryUrl]);

  const onExitRecovery = useAuthRecoveryExit(() => setNativeRecoveryResult(null));

  // Web's synchronous result is authoritative when present (its own
  // mechanism, unchanged); the native async result only ever matters on
  // native, where webRedirectResult is always 'none'.
  const redirectResult: AuthRedirectResult =
    webRedirectResult.type !== 'none' ? webRedirectResult : (nativeRecoveryResult ?? { type: 'none' });

  if (isResolvingNativeRecovery) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // This tab/app landed directly from a Supabase auth email link. Which
  // screen it gets depends on which kind of link:
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
  if (redirectResult.type === 'recovery') {
    return <ResetPasswordScreen onExitRecovery={onExitRecovery} />;
  }
  if (redirectResult.type === 'error') {
    return <RecoveryLinkExpiredScreen onExitRecovery={onExitRecovery} />;
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex:           1,
    backgroundColor: colors.background,
    alignItems:     'center',
    justifyContent: 'center',
  },
});

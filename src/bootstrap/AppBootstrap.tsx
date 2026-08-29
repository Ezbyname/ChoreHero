import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthBootstrap } from '@/bootstrap/AuthBootstrap';
import { AppDataBootstrap } from '@/bootstrap/AppDataBootstrap';
import { AuthGate } from '@/navigation/AuthGate';
import { useAppStore } from '@/store/useAppStore';
import { selectAuthUserEmail } from '@/store/selectors';
import { classifyAuthRedirect, getAuthRedirectResult, type AuthRedirectResult } from '@/lib/authRedirectDetection';
import { clearAuthRecoveryLink, useAuthRecoveryLink } from '@/lib/useAuthRecoveryLink';
import { useAuthRecoveryExit } from '@/lib/useAuthRecoveryExit';
import { extractRecoveryTokens, parseLinkingUrl } from '@/lib/authRecoveryLinkParsing';
import { resolveAppBootstrapView } from '@/lib/appBootstrapView';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { colors } from '@/theme';
import { EmailConfirmedScreen } from '@/screens/EmailConfirmedScreen';
import { ResetPasswordScreen } from '@/screens/ResetPasswordScreen';
import { RecoveryLinkExpiredScreen } from '@/screens/RecoveryLinkExpiredScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';

// AppBootstrap is the root of the non-navigation tree.
// Rendering order:
//   AuthBootstrap — subscribes to Supabase auth; sets auth state in store
//   AppDataBootstrap — reacts to auth state; runs Supabase DB hydration
//   AuthGate — pure renderer; reads store state; shows correct navigator

export function AppBootstrap() {
  const isMockHydrated      = useAppStore((s) => s.isMockHydrated);
  const hydrateFromMockSeed = useAppStore((s) => s.hydrateFromMockSeed);
  // A1 — Recovery Email Prefill. Reliable existing store state — never
  // derived from the recovery URL/token itself. null whenever no session
  // exists (e.g. this device was never authenticated), which is the normal,
  // expected case, not an error.
  const authUserEmail = useAppStore(selectAuthUserEmail);

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

  // Sub-state for the 'error' (expired/invalid/already-used link) branch
  // only. Deliberately separate from onExitRecovery: "Request a new link"
  // must always show the request form, regardless of whether a valid auth
  // session happens to already exist — see RecoveryLinkExpiredScreen.tsx's
  // comment for the bug this fixes. Reset to 'expired' whenever a fresh
  // error result arrives (below), so a leftover 'requestReset' from an
  // earlier interaction can't leak into a new, unrelated expired link.
  const [expiredRecoveryMode, setExpiredRecoveryMode] = React.useState<'expired' | 'requestReset'>('expired');

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
        if (!sessionEstablished) {
          setExpiredRecoveryMode('expired');
        }
        setNativeRecoveryResult(
          sessionEstablished ? result : { type: 'error', errorCode: 'session_establish_failed' },
        );
      } else if (result.type !== 'none') {
        if (result.type === 'error') {
          setExpiredRecoveryMode('expired');
        }
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

  // Which screen this tab/app shows next — see appBootstrapView.ts for the
  // full decision table. Extracted to a pure function specifically so this
  // decision (in particular the N1.3 corrective-patch fix: "Request a new
  // link" must always mean requesting a new link, never silently falling
  // through to an existing authenticated session) is directly unit-tested,
  // not just asserted from reading the JSX.
  const bootstrapView = resolveAppBootstrapView(isResolvingNativeRecovery, redirectResult, expiredRecoveryMode);

  switch (bootstrapView.view) {
    case 'loading':
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    case 'resetPassword':
      return <ResetPasswordScreen onExitRecovery={onExitRecovery} />;
    case 'recoveryExpired':
      return <RecoveryLinkExpiredScreen onRequestNewLink={() => setExpiredRecoveryMode('requestReset')} />;
    case 'requestNewLink':
      // Its own "Back to Sign in" link is a deliberate, explicit "never
      // mind" action at that point, so it's fine for that one to fall
      // through to the normal onExitRecovery behavior (Product Decision
      // A's same "prefer an existing valid session" logic applies there
      // too, unlike the primary "Request a new link" CTA above it).
      // initialEmail: convenience prefill only — see ForgotPasswordScreen's
      // own comment for why passing the current store value here is safe.
      return <ForgotPasswordScreen onBack={onExitRecovery} initialEmail={authUserEmail ?? undefined} />;
    case 'emailConfirmed':
      return <EmailConfirmedScreen />;
    case 'normalBoot':
      return (
        <AuthBootstrap>
          <AppDataBootstrap>
            <AuthGate />
          </AppDataBootstrap>
        </AuthBootstrap>
      );
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex:           1,
    backgroundColor: colors.background,
    alignItems:     'center',
    justifyContent: 'center',
  },
});

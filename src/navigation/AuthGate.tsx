import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { supabaseConfigStatus } from '@/lib/supabaseConfig';
import { AuthStack } from '@/navigation/AuthStack';
import { AuthenticatedAppGate } from '@/navigation/AuthenticatedAppGate';
import { RootNavigator } from '@/navigation/RootNavigator';
import {
  selectAuthError,
  selectIsAuthResolved,
  selectIsAuthenticated,
  selectIsAuthLoading,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, spacing, typography } from '@/theme';

/**
 * Pure rendering component — no effects, no store writes, no Supabase calls.
 * Auth state + config state → rendered tree.
 *
 * Owns only the auth boundary. Does not decide hydration state,
 * missing profile, partial household, or any authenticated app-state UX.
 *
 * Branch order:
 *   1. Supabase not configured  → mock/dev mode → RootNavigator (bypass auth)
 *   2. Auth loading / unresolved → calm loading state
 *   3. Authenticated            → AuthenticatedAppGate (owns all authenticated UX)
 *   4. Unauthenticated          → AuthStack
 */
export function AuthGate() {
  const isAuthResolved  = useAppStore(selectIsAuthResolved);
  const isAuthLoading   = useAppStore(selectIsAuthLoading);
  const isAuthenticated = useAppStore(selectIsAuthenticated);
  const authError       = useAppStore(selectAuthError);

  // 1. Mock / dev fallback — keeps the app usable without Supabase credentials.
  const isMockDevMode =
    supabaseConfigStatus === 'missing' || supabaseConfigStatus === 'partial';

  if (isMockDevMode) {
    return <RootNavigator />;
  }

  // 2. Waiting for Supabase INITIAL_SESSION event.
  if (!isAuthResolved || isAuthLoading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Getting ChoreHero ready…</Text>
        {authError ? (
          <Text style={styles.errorText}>{authError}</Text>
        ) : null}
      </View>
    );
  }

  // 3. Authenticated → delegate all authenticated app-state decisions to
  //    AuthenticatedAppGate (hydration state, missing profile, no household, etc.)
  if (isAuthenticated) {
    return <AuthenticatedAppGate />;
  }

  // 4. Unauthenticated.
  return <AuthStack />;
}

const styles = StyleSheet.create({
  loading: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    backgroundColor:   colors.background,
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    ...typography.body,
    color:     colors.textMuted,
    textAlign: 'center',
  },
  errorText: {
    ...typography.caption,
    color:     colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

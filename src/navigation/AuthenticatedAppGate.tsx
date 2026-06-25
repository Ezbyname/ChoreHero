import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RootNavigator } from '@/navigation/RootNavigator';
import { ProfileSetupScreen } from '@/screens/ProfileSetupScreen';
import {
  selectAppHydrationState,
  selectIsAppDataLoading,
  selectAppDataError,
  selectNeedsProfileSetup,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, spacing, typography } from '@/theme';
import { copy } from '@/content/copy';

/**
 * Single routing authority for authenticated app UX states.
 * AuthGate delegates here for all authenticated Supabase users.
 *
 * Branch order:
 *   1. loading                      → calm loading screen
 *   2. error + missing_profile      → ProfileSetupScreen (recovery UX)
 *   3. error (generic load failure) → friendly error placeholder
 *   4. partial (no household)       → no-household placeholder
 *   5. hydrated                     → RootNavigator
 *
 * AuthGate decides: mock/dev vs unauthenticated vs authenticated.
 * This component decides: what authenticated users see based on hydration state.
 * No duplication between the two.
 */
export function AuthenticatedAppGate() {
  const appHydrationState = useAppStore(selectAppHydrationState);
  const isAppDataLoading  = useAppStore(selectIsAppDataLoading);
  const appDataError      = useAppStore(selectAppDataError);
  const needsProfileSetup = useAppStore(selectNeedsProfileSetup);

  // 1. Loading
  if (isAppDataLoading || appHydrationState === 'loading') {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Getting your ChoreHero ready…</Text>
      </View>
    );
  }

  // 2. Missing profile → recovery UX (not a generic error)
  if (needsProfileSetup) {
    return <ProfileSetupScreen />;
  }

  // 3. Generic hydration error
  if (appHydrationState === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {appDataError ?? copy.errors.generic}
        </Text>
      </View>
    );
  }

  // 4. No household membership yet (partial state)
  if (appHydrationState === 'partial') {
    return (
      <View style={styles.center}>
        <Text style={styles.placeholderTitle}>You are not in a household yet.</Text>
        <Text style={styles.placeholderBody}>
          Ask a family member to invite you, or create a new household.
        </Text>
      </View>
    );
  }

  // 5. Fully hydrated
  return <RootNavigator />;
}

const styles = StyleSheet.create({
  center: {
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
    ...typography.body,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  placeholderTitle: {
    ...typography.heading,
    color:        colors.textPrimary,
    textAlign:    'center',
    marginBottom: spacing.sm,
  },
  placeholderBody: {
    ...typography.body,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
});

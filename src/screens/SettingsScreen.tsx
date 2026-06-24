import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { signOut } from '@/services/supabase/auth';
import {
  selectAuthUserEmail,
  selectIsAuthenticated,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, spacing, typography } from '@/theme';

/**
 * Logout section behavior:
 *   - Visible only when authenticated (Supabase session exists).
 *   - Calls signOut() wrapper — does not clear Zustand manually.
 *   - Does not navigate imperatively after logout.
 *   - AuthBootstrap receives SIGNED_OUT → clearAuthSession → AuthGate switches tree.
 */
export function SettingsScreen() {
  const isAuthenticated = useAppStore(selectIsAuthenticated);
  const authUserEmail   = useAppStore(selectAuthUserEmail);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [localError,   setLocalError]   = useState<string | null>(null);

  async function handleSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setLocalError(null);

    try {
      const { error } = await signOut();
      if (error) {
        setLocalError(copy.auth.logoutError);
      }
      // On success: do nothing.
      // AuthBootstrap receives SIGNED_OUT → clearAuthSession → AuthGate switches.
    } catch {
      setLocalError(copy.auth.logoutError);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader
        title={copy.screens.settings.title}
        subtitle={copy.screens.settings.subtitle}
      />

      {isAuthenticated && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{copy.auth.account}</Text>

          {authUserEmail ? (
            <View style={styles.emailRow}>
              <Text style={styles.emailLabel}>{copy.auth.signedInAs}</Text>
              <Text style={styles.emailValue}>{authUserEmail}</Text>
            </View>
          ) : null}

          {localError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{localError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.signOutButton, isSigningOut && styles.buttonDisabled]}
            onPress={handleSignOut}
            disabled={isSigningOut}
            activeOpacity={0.8}
          >
            <Text style={styles.signOutText}>
              {isSigningOut ? copy.auth.signingOut : copy.auth.signOut}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop:         spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  sectionTitle: {
    ...typography.caption,
    color:         colors.textMuted,
    fontWeight:    '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom:  spacing.sm,
  },
  emailRow: {
    backgroundColor:   colors.surface,
    borderRadius:      10,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    marginBottom:      spacing.sm,
  },
  emailLabel: {
    ...typography.caption,
    color:        colors.textMuted,
    marginBottom: 2,
  },
  emailValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  errorBox: {
    backgroundColor: colors.errorSoft,
    borderRadius:    8,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: '#B91C1C',
  },
  signOutButton: {
    borderWidth:     1,
    borderColor:     colors.borderSoft,
    borderRadius:    10,
    paddingVertical: spacing.md,
    alignItems:      'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  signOutText: {
    ...typography.body,
    color:      colors.textSecondary,
    fontWeight: '500',
  },
});

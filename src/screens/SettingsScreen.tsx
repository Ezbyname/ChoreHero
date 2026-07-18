import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { HouseholdInvitesSection } from '@/features/household/components/HouseholdInvitesSection';
import { signOut } from '@/services/supabase/auth';
import {
  selectAuthUserEmail,
  selectCanInviteMembers,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectIsAuthenticated,
  selectActiveHouseholdName,
  selectHasActiveHousehold,
  selectCurrentUserName,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, spacing, typography } from '@/theme';

/**
 * Settings screen — account info, active household display, sign-out.
 *
 * Active household display:
 *   - Reads from selectActiveHouseholdName (selector only).
 *   - Does NOT call households.find(...).
 *   - Does NOT access households[0].
 *   - Does NOT resolve activeHouseholdId manually.
 *   - Hydration owns selection; this screen only renders the result.
 *
 * Sign-out behavior:
 *   - Calls signOut() wrapper — does not clear Zustand manually.
 *   - AuthBootstrap receives SIGNED_OUT → clearAuthSession → AuthGate switches tree.
 */
export function SettingsScreen() {
  const isAuthenticated      = useAppStore(selectIsAuthenticated);
  const authUserEmail        = useAppStore(selectAuthUserEmail);
  const currentUserName      = useAppStore(selectCurrentUserName);
  const activeHouseholdName  = useAppStore(selectActiveHouseholdName);
  const hasActiveHousehold   = useAppStore(selectHasActiveHousehold);
  const household             = useAppStore(selectCurrentHousehold);
  const user                  = useAppStore(selectCurrentUser);
  const role                  = useAppStore(selectCurrentMemberRole);
  const canInviteMembers      = useAppStore(selectCanInviteMembers);

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
    <Screen style={styles.screen}>
      <ScreenHeader
        title={copy.screens.settings.title}
        subtitle={copy.screens.settings.subtitle}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Household section ─────────────────────────────────────────────── */}
        {hasActiveHousehold && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {copy.settingsScreen.householdSection}
            </Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>
                {activeHouseholdName ?? copy.settingsScreen.noHousehold}
              </Text>
            </View>
          </View>
        )}

        {/* ── Invite members (owner/admin only) ─────────────────────────────── */}
        {canInviteMembers && household && user && (
          <HouseholdInvitesSection
            householdId={household.id}
            createdByProfileId={user.id}
            role={role}
          />
        )}

        {/* ── Account section ───────────────────────────────────────────────── */}
        {isAuthenticated && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{copy.auth.account}</Text>

            {(currentUserName || authUserEmail) ? (
              <View style={styles.infoRow}>
                {currentUserName ? (
                  <Text style={styles.infoValue}>{currentUserName}</Text>
                ) : null}
                {authUserEmail ? (
                  <Text style={styles.infoLabel}>{authUserEmail}</Text>
                ) : null}
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
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
  infoRow: {
    backgroundColor:   colors.surface,
    borderRadius:      10,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    marginBottom:      spacing.sm,
    gap:               2,
  },
  infoValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
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

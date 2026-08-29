import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { HouseholdInvitesSection } from '@/features/household/components/HouseholdInvitesSection';
import { formatBuildInfoForCopy, runtimeBuildInfo } from '@/lib/runtimeBuildInfo';
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
// QA-01 — Runtime Build Identification. Read-only diagnostics only — see
// src/lib/runtimeBuildInfo.ts for the canonical model and copy formatter
// this section and the Copy action both consume (no duplicated
// formatting logic here).
function AboutSection() {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  async function handleCopy() {
    try {
      const ok = await Clipboard.setStringAsync(formatBuildInfoForCopy(runtimeBuildInfo));
      setCopyFeedback(ok ? copy.about.copySuccess : copy.about.copyFailure);
    } catch {
      setCopyFeedback(copy.about.copyFailure);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{copy.about.sectionTitle}</Text>

      <View style={styles.infoRow}>
        <Text style={styles.appName}>{runtimeBuildInfo.appName}</Text>

        <View style={styles.buildInfoGrid}>
          <Text style={styles.buildInfoLabel}>{copy.about.versionLabel}</Text>
          <Text style={styles.buildInfoValue}>{runtimeBuildInfo.displayVersion}</Text>

          <Text style={styles.buildInfoLabel}>{copy.about.buildLabel}</Text>
          <Text style={styles.buildInfoValue}>{runtimeBuildInfo.buildNumber}</Text>

          <Text style={styles.buildInfoLabel}>{copy.about.environmentLabel}</Text>
          <Text style={styles.buildInfoValue}>{runtimeBuildInfo.environmentLabel}</Text>

          <Text style={styles.buildInfoLabel}>{copy.about.commitLabel}</Text>
          <Text style={styles.buildInfoValue}>{runtimeBuildInfo.shortGitSha}</Text>

          <Text style={styles.buildInfoLabel}>{copy.about.backendLabel}</Text>
          <Text style={styles.buildInfoValue}>{runtimeBuildInfo.backendTarget}</Text>
        </View>

        <TouchableOpacity style={styles.copyButton} onPress={handleCopy} activeOpacity={0.8}>
          <Text style={styles.copyButtonText}>{copy.about.copyButton}</Text>
        </TouchableOpacity>

        {copyFeedback ? <Text style={styles.copyFeedbackText}>{copyFeedback}</Text> : null}
      </View>
    </View>
  );
}

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

        {/* ── About / Runtime build identification (QA-01) ─────────────────── */}
        <AboutSection />
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
  appName: {
    ...typography.body,
    color:        colors.textPrimary,
    fontWeight:   '600',
    marginBottom: spacing.sm,
  },
  buildInfoGrid: {
    flexDirection:   'row',
    flexWrap:        'wrap',
    marginBottom:    spacing.md,
  },
  buildInfoLabel: {
    ...typography.caption,
    color:    colors.textMuted,
    width:    '40%',
    marginBottom: spacing.xs,
  },
  buildInfoValue: {
    ...typography.caption,
    color:        colors.textPrimary,
    fontWeight:   '600',
    width:        '60%',
    marginBottom: spacing.xs,
  },
  copyButton: {
    borderWidth:     1,
    borderColor:     colors.borderSoft,
    borderRadius:    10,
    paddingVertical: spacing.sm,
    alignItems:      'center',
  },
  copyButtonText: {
    ...typography.body,
    color:      colors.primary,
    fontWeight: '600',
  },
  copyFeedbackText: {
    ...typography.caption,
    color:     colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});

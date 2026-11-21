import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import { HouseholdInvitesSection } from '@/features/household/components/HouseholdInvitesSection';
import { ProfileEditModal } from '@/features/profile/ProfileEditModal';
import { SyncDiagnosticsPanel } from '@/features/sync/components/SyncDiagnosticsPanel';
import { isSyncDiagnosticsVisible } from '@/features/sync/syncDiagnostics';
import { currentBuildInfo } from '@/lib/currentBuildInfo';
import { formatAccountType } from '@/lib/formatAccountType';
import { formatBuildInfoForCopy } from '@/lib/runtimeBuildInfo';
import { visibleSettingsSections, type SettingsSection } from '@/screens/settingsLayout';
import type { SettingsAudience } from '@/navigation/roleShell';
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
import { colors, sizes, spacing, typography } from '@/theme';

/**
 * Settings — profile, household, invites, about, and (always last) sign out.
 *
 * Active household display:
 *   - Reads from selectActiveHouseholdName (selector only).
 *   - Hydration owns selection; this screen only renders the result.
 *
 * Sign-out behavior:
 *   - Confirmed first (no accidental sign-out), then calls the signOut()
 *     wrapper — does not clear Zustand manually.
 *   - AuthBootstrap receives SIGNED_OUT → clearAuthSession → AuthGate switches tree.
 */
// QA-01 — Runtime Build Identification. Read-only diagnostics only — see
// src/lib/runtimeBuildInfo.ts for the canonical model and copy formatter.
function AboutSection() {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  async function handleCopy() {
    try {
      const ok = await Clipboard.setStringAsync(formatBuildInfoForCopy(currentBuildInfo));
      setCopyFeedback(ok ? copy.about.copySuccess : copy.about.copyFailure);
    } catch {
      setCopyFeedback(copy.about.copyFailure);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{copy.about.sectionTitle}</Text>

      <Card>
        <Text style={styles.appName}>{currentBuildInfo.appName}</Text>

        <View style={styles.buildInfoGrid}>
          <Text style={styles.buildInfoLabel}>{copy.about.versionLabel}</Text>
          <Text style={styles.buildInfoValue}>{currentBuildInfo.displayVersion}</Text>

          <Text style={styles.buildInfoLabel}>{copy.about.buildLabel}</Text>
          <Text style={styles.buildInfoValue}>{currentBuildInfo.buildNumber}</Text>

          <Text style={styles.buildInfoLabel}>{copy.about.environmentLabel}</Text>
          <Text style={styles.buildInfoValue}>{currentBuildInfo.environmentLabel}</Text>

          <Text style={styles.buildInfoLabel}>{copy.about.commitLabel}</Text>
          <Text style={styles.buildInfoValue}>{currentBuildInfo.shortGitSha}</Text>

          <Text style={styles.buildInfoLabel}>{copy.about.backendLabel}</Text>
          <Text style={styles.buildInfoValue}>{currentBuildInfo.backendTarget}</Text>
        </View>

        <AppButton label={copy.about.copyButton} icon="copy-outline" variant="secondary" compact onPress={() => { void handleCopy(); }} />

        {copyFeedback ? <Text style={styles.copyFeedbackText}>{copyFeedback}</Text> : null}
      </Card>
    </View>
  );
}

// The section renderer, shared by Settings, the child Me tab and the adult
// Family tab, so no settings logic is duplicated. Each caller passes the
// sections it wants. Visibility rules live in settingsLayout.ts.
export function SettingsSectionList({ sections }: { sections: readonly SettingsSection[] }) {
  const authUserEmail        = useAppStore(selectAuthUserEmail);
  const currentUserName      = useAppStore(selectCurrentUserName);
  const activeHouseholdName  = useAppStore(selectActiveHouseholdName);
  const household             = useAppStore(selectCurrentHousehold);
  const user                  = useAppStore(selectCurrentUser);
  const role                  = useAppStore(selectCurrentMemberRole);
  const accountType            = formatAccountType(role);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [localError,   setLocalError]   = useState<string | null>(null);
  const [profileOpen,  setProfileOpen]  = useState(false);

  async function doSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setLocalError(null);

    try {
      const { error } = await signOut();
      if (error) {
        setLocalError(copy.auth.logoutError);
      }
      // On success: do nothing — AuthBootstrap receives SIGNED_OUT.
    } catch {
      setLocalError(copy.auth.logoutError);
    } finally {
      setIsSigningOut(false);
    }
  }

  function confirmSignOut() {
    if (isSigningOut) return;
    Alert.alert(
      copy.settingsScreen.signOutConfirmTitle,
      copy.settingsScreen.signOutConfirmBody,
      [
        { text: copy.settingsScreen.signOutCancel, style: 'cancel' },
        { text: copy.settingsScreen.signOutConfirm, style: 'destructive', onPress: () => { void doSignOut(); } },
      ],
      { cancelable: true },
    );
  }

  function renderSection(section: SettingsSection) {
    switch (section) {
      case 'profile':
        return (
          <View key={section} style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">{copy.settingsScreen.profileSection}</Text>
            <Card>
              <View style={styles.profileRow}>
                <FamilyAvatar name={currentUserName ?? '?'} avatarUrl={user?.avatarUrl} avatarEmoji={user?.avatarEmoji} size={sizes.avatar + 8} />
                <View style={styles.flex}>
                  {currentUserName ? <Text style={styles.infoValue}>{currentUserName}</Text> : null}
                  {authUserEmail ? <Text style={styles.infoLabel}>{authUserEmail}</Text> : null}
                  {accountType ? <Text style={styles.infoLabel}>{copy.auth.accountTypeLabel}: {accountType}</Text> : null}
                </View>
              </View>
              <Pressable
                onPress={() => setProfileOpen(true)}
                style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
                accessibilityRole="button"
                accessibilityLabel={copy.settingsScreen.editProfile}
                accessibilityHint={copy.settingsScreen.editProfileHint}>
                <Ionicons name="person-circle-outline" size={22} color={colors.primary} />
                <View style={styles.flex}>
                  <Text style={styles.linkText}>{copy.settingsScreen.editProfile}</Text>
                  <Text style={styles.infoLabel}>{copy.settingsScreen.editProfileHint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>
            </Card>
          </View>
        );
      case 'household':
        return (
          <View key={section} style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">{copy.settingsScreen.householdSection}</Text>
            <Card>
              <View style={styles.profileRow}>
                <Ionicons name="home-outline" size={22} color={colors.primary} />
                <Text style={styles.infoValue}>{activeHouseholdName ?? copy.settingsScreen.noHousehold}</Text>
              </View>
            </Card>
          </View>
        );
      case 'invites':
        return household && user ? (
          <HouseholdInvitesSection
            key={section}
            householdId={household.id}
            createdByProfileId={user.id}
            role={role}
          />
        ) : null;
      case 'about':
        return <AboutSection key={section} />;
      case 'syncDiagnostics':
        return <SyncDiagnosticsPanel key={section} />;
      case 'session':
        // Always last, separated, destructive styling, confirmed first.
        return (
          <View key={section} style={[styles.section, styles.sessionSection]}>
            <Text style={styles.sectionTitle} accessibilityRole="header">{copy.settingsScreen.sessionSection}</Text>
            {localError ? <Banner tone="danger" text={localError} /> : null}
            <AppButton
              label={isSigningOut ? copy.auth.signingOut : copy.auth.signOut}
              icon="log-out-outline"
              variant="dangerOutline"
              busy={isSigningOut}
              busyLabel={copy.auth.signingOut}
              onPress={confirmSignOut}
            />
          </View>
        );
    }
  }

  return (
    <>
      {sections.map(renderSection)}
      <ProfileEditModal visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}

type SettingsScreenProps = {
  // 'child' is the Me tab: the same Settings, without invites. Omitted
  // means 'household', which is the unchanged adult Settings.
  audience?: SettingsAudience;
  // Pushed on the root stack below a native header (adult Settings). That
  // header already pads the status bar.
  inStack?:  boolean;
};

export function SettingsScreen({ audience = 'household', inStack = false }: SettingsScreenProps = {}) {
  const isAuthenticated    = useAppStore(selectIsAuthenticated);
  const hasActiveHousehold = useAppStore(selectHasActiveHousehold);
  const canInviteMembers   = useAppStore(selectCanInviteMembers);

  const sections = visibleSettingsSections({
    isAuthenticated,
    hasActiveHousehold,
    canInviteMembers,
    showSyncDiagnostics: isSyncDiagnosticsVisible(currentBuildInfo.appVariant),
    audience,
  });

  return (
    <Screen style={styles.screen} edges={inStack ? STACK_EDGES : undefined}>
      {inStack ? null : (
        <ScreenHeader
          title={copy.screens.settings.title}
          subtitle={copy.screens.settings.subtitle}
        />
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <SettingsSectionList sections={sections} />
      </ScrollView>
    </Screen>
  );
}

const STACK_EDGES = ['left', 'right', 'bottom'] as const;

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  content: {
    paddingBottom: spacing.xxxl,
  },
  section: {
    marginTop:         spacing.lg,
    paddingHorizontal: spacing.xl,
    gap:               spacing.sm,
  },
  sessionSection: {
    marginTop:      spacing.xxxl,
    paddingTop:     spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    ...typography.label,
    color:         colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  flex: {
    flex: 1,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
  },
  infoValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  linkRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.md,
    minHeight:      sizes.tapTarget,
    marginTop:      spacing.md,
    paddingTop:     spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  linkRowPressed: {
    opacity: 0.6,
  },
  linkText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  appName: {
    ...typography.bodyStrong,
    color:        colors.textPrimary,
    marginBottom: spacing.sm,
  },
  buildInfoGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    marginBottom:  spacing.md,
  },
  buildInfoLabel: {
    ...typography.caption,
    color:        colors.textSecondary,
    width:        '40%',
    marginBottom: spacing.xs,
  },
  buildInfoValue: {
    ...typography.caption,
    color:        colors.textPrimary,
    fontWeight:   '600',
    width:        '60%',
    marginBottom: spacing.xs,
  },
  copyFeedbackText: {
    ...typography.caption,
    color:     colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import { formatAccountType } from '@/lib/formatAccountType';
import { SettingsSectionList } from '@/screens/SettingsScreen';
import { visibleFamilySections, type FamilySection } from '@/screens/settingsLayout';
import {
  selectCanInviteMembers,
  selectCurrentHousehold,
  selectHasActiveHousehold,
  selectIsAuthenticated,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, sizes, spacing, typography } from '@/theme';

// Adult Family tab (Slice 4, navigation only). It only uses existing data
// and sections:
//   - Profile, household and invites reuse SettingsSectionList, so there is
//     one implementation. Invites stay gated by household.invite.
//   - Members is a read-only list of the hydrated household members. No new
//     family-management features.
//   - Settings opens the full, unchanged Settings. The tab shell wires the
//     navigation through onOpenSettings, so this screen never navigates.
export function FamilyScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const isAuthenticated    = useAppStore(selectIsAuthenticated);
  const hasActiveHousehold = useAppStore(selectHasActiveHousehold);
  const canInviteMembers   = useAppStore(selectCanInviteMembers);
  const household          = useAppStore(selectCurrentHousehold);
  const members            = household?.members ?? [];

  const sections = visibleFamilySections({ isAuthenticated, hasActiveHousehold, canInviteMembers });

  function renderSection(section: FamilySection) {
    switch (section) {
      case 'profile':
      case 'household':
      case 'invites':
        return <SettingsSectionList key={section} sections={[section]} />;
      case 'members':
        return (
          <View key={section} style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">{copy.navigation.familyMembersSection}</Text>
            <Card>
              {members.map((m, i) => (
                <View key={m.id} style={[styles.memberRow, i > 0 && styles.memberDivider]}>
                  <FamilyAvatar name={m.name} avatarUrl={m.avatarUrl} avatarEmoji={m.avatarEmoji} />
                  <View style={styles.flex}>
                    <Text style={styles.memberName}>{m.name}</Text>
                    {formatAccountType(m.role) ? <Text style={styles.memberRole}>{formatAccountType(m.role)}</Text> : null}
                  </View>
                </View>
              ))}
            </Card>
          </View>
        );
      case 'settingsLink':
        return (
          <View key={section} style={styles.section}>
            <Card>
              <Pressable
                onPress={onOpenSettings}
                style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={copy.navigation.familySettingsLink}
                accessibilityHint={copy.navigation.familySettingsHint}>
                <Ionicons name="settings-outline" size={22} color={colors.primary} />
                <View style={styles.flex}>
                  <Text style={styles.linkText}>{copy.navigation.familySettingsLink}</Text>
                  <Text style={styles.memberRole}>{copy.navigation.familySettingsHint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>
            </Card>
          </View>
        );
    }
  }

  return (
    <Screen style={styles.screen}>
      <ScreenHeader title={copy.screens.family.title} subtitle={copy.screens.family.subtitle} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {sections.map(renderSection)}
      </ScrollView>
    </Screen>
  );
}

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
  sectionTitle: {
    ...typography.label,
    color:         colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  flex: {
    flex: 1,
  },
  memberRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.md,
    paddingVertical: spacing.sm,
  },
  memberDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  memberName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  memberRole: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
    minHeight:     sizes.tapTarget,
  },
  pressed: {
    opacity: 0.6,
  },
  linkText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
});

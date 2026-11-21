import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import { buildAdultFamilyModel, type InviteCard } from '@/features/adultFamily/adultFamilyModel';
import { useActiveInvites } from '@/features/adultFamily/useActiveInvites';
import { ProfileEditModal } from '@/features/profile/ProfileEditModal';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
import { useAdultText, useBoldCaption } from '@/screens/AdultHomeScreen';
import {
  selectActiveHouseholdName,
  selectCanInviteMembers,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectCurrentUserName,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, lockedSpacing as sp, radius, sizes } from '@/theme';

// Slice 6D: Adult Family (Board 12, adult tokens from Board 14). The
// household-management hub, in Board 12's order and nothing else:
//   header → current profile → Members → Invite someone → Settings.
//   - Profile opens the EXISTING ProfileEditModal (name, emoji, photo).
//   - Members: identity and role only, store order. No Points, progress,
//     rankings or family metric.
//   - Invite someone (owner/admin only): the newest usable code from the
//     existing active-invites query, its real validity, and Share (the
//     system share sheet; where the platform has none, the existing
//     clipboard copy). Generate / Revoke / the role picker stay in
//     Settings → Invites, unchanged.
//   - Settings opens the existing Settings (not a tab) through
//     onOpenSettings; Home's avatar opens the same route.
// Adult intensity: flat white cards, hairline, radius 14, 48dp targets,
// Rubik, no gold (nothing here is Points). The screen is navigation-free.
export function AdultFamilyScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const t = useAdultText();
  const boldCaption = useBoldCaption();
  const user          = useAppStore(selectCurrentUser);
  const userName      = useAppStore(selectCurrentUserName);
  const role          = useAppStore(selectCurrentMemberRole);
  const household     = useAppStore(selectCurrentHousehold);
  const householdName = useAppStore(selectActiveHouseholdName);
  const canInvite     = useAppStore(selectCanInviteMembers);
  const invites       = useActiveInvites(household?.id ?? null, canInvite);
  const refreshControl = useHouseholdRefreshControl(canInvite ? invites.reload : undefined);

  const model = useMemo(() => buildAdultFamilyModel({
    viewer:  user ? { id: user.id, name: userName, avatarUrl: user.avatarUrl, avatarEmoji: user.avatarEmoji } : null,
    role,
    householdName,
    members: household?.members ?? [],
    canInvite,
    invites: invites.state,
    now:     new Date(),
  }), [user, userName, role, householdName, household, canInvite, invites.state]);

  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={refreshControl}>
        <Text style={[t('h1'), styles.ink]} accessibilityRole="header">{copy.adultFamily.title}</Text>

        {model.profile ? (
          <Card density="adult" style={styles.profileCard}>
            <View style={styles.profileText} accessible accessibilityLabel={model.profile.a11yLabel}>
              <FamilyAvatar name={model.profile.name || '?'} avatarUrl={model.profile.avatarUrl} avatarEmoji={model.profile.avatarEmoji} size={40} />
              <View style={styles.flex}>
                <Text style={[t('title'), styles.ink]}>{model.profile.name}</Text>
                {model.profile.line ? <Text style={[t('caption'), styles.muted]}>{model.profile.line}</Text> : null}
              </View>
            </View>
            <Pressable
              onPress={() => setProfileOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={copy.adultFamily.profileA11y}
              accessibilityHint={copy.adultFamily.profileHint}
              style={({ pressed }) => [styles.textButton, pressed && styles.pressedTint]}>
              <Text style={[t('title'), styles.indigoInk]}>{copy.adultFamily.profile}</Text>
            </Pressable>
          </Card>
        ) : null}

        <Card density="adult" style={styles.listCard}>
          <Text style={[t('overline'), styles.muted, styles.cardHeading]} accessibilityRole="header">{model.members.heading}</Text>
          {model.members.rows.map((row, i) => (
            <View key={row.member.id} style={[styles.memberRow, i > 0 && styles.divider]} accessible accessibilityLabel={row.a11yLabel}>
              <FamilyAvatar name={row.name} avatarUrl={row.member.avatarUrl} avatarEmoji={row.member.avatarEmoji} size={32} />
              <Text style={[t('title'), styles.ink, styles.flex]}>{row.name}</Text>
              {row.roleLabel ? (
                <View style={styles.rolePill}>
                  <Text style={[boldCaption, styles.indigoDeep]}>{row.roleLabel}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </Card>

        <InviteSection card={model.invite} />

        <Card density="adult" style={styles.listCard}>
          <Pressable
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel={model.settings.label}
            accessibilityHint={model.settings.hint}
            style={({ pressed }) => [styles.settingsRow, pressed && styles.pressedTint]}>
            <Ionicons name="settings-outline" size={22} color={colors.indigo} />
            <Text style={[t('title'), styles.ink, styles.flex]}>{model.settings.label}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        </Card>
      </ScrollView>
      <ProfileEditModal visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </Screen>
  );
}

function InviteSection({ card }: { card: InviteCard }) {
  const t = useAdultText();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sharing, setSharing]   = useState(false);
  if (card.kind === 'hidden') return null;

  async function share() {
    if (card.kind !== 'code' || sharing) return;
    setSharing(true);
    setFeedback(null);
    try {
      await Share.share({ message: card.shareMessage });
    } catch {
      // No share sheet on this platform (e.g. a desktop browser): the
      // existing clipboard path instead, with honest feedback.
      try {
        const ok = await Clipboard.setStringAsync(card.code);
        setFeedback(ok ? copy.adultFamily.copied : copy.adultFamily.shareFailed);
      } catch {
        setFeedback(copy.adultFamily.shareFailed);
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <Card density="adult" style={styles.inviteCard}>
      <View style={styles.inviteHead}>
        <Text style={[t('h2'), styles.ink, styles.flex]} accessibilityRole="header">{copy.adultFamily.inviteTitle}</Text>
        {card.kind === 'code' && card.validityLabel ? <Text style={[t('caption'), styles.muted]}>{card.validityLabel}</Text> : null}
      </View>
      {card.kind === 'code' ? (
        <>
          <View style={styles.inviteRow}>
            <View style={styles.codeBox} accessible accessibilityLabel={card.codeA11y}>
              <Text style={[t('h2'), styles.code]} selectable>{card.code}</Text>
              <Text style={[t('caption'), styles.indigoDeep]}>{card.forLabel}</Text>
            </View>
            <Pressable
              onPress={() => { void share(); }}
              disabled={sharing}
              accessibilityRole="button"
              accessibilityLabel={card.shareA11y}
              accessibilityState={{ disabled: sharing, busy: sharing }}
              style={({ pressed }) => [styles.shareButton, pressed && styles.pressedTint, sharing && styles.dim]}>
              <Ionicons name="share-outline" size={20} color={colors.indigo} />
              <Text style={[t('title'), styles.indigoInk]}>{copy.adultFamily.share}</Text>
            </Pressable>
          </View>
          {card.moreLabel ? <Text style={[t('caption'), styles.muted]}>{card.moreLabel}</Text> : null}
          {feedback ? <Text style={[t('caption'), styles.muted]} accessibilityLiveRegion="polite">{feedback}</Text> : null}
        </>
      ) : (
        <Text style={[t('body'), styles.muted]}>{card.text}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    backgroundColor:   colors.adultGround,
  },
  content: {
    paddingHorizontal: sp.lg,
    paddingTop:        sp.md,
    paddingBottom:     sp.xxl,
    gap:               sp.md,
  },
  flex: { flex: 1, minWidth: 0 },
  ink: { color: colors.ink },
  muted: { color: colors.textSecondary },
  indigoInk: { color: colors.indigo },
  indigoDeep: { color: colors.indigoDeep },
  dim: { opacity: 0.6 },
  pressedTint: { backgroundColor: colors.indigoTint },
  profileCard: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    alignItems:    'center',
    gap:           sp.md,
  },
  profileText: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           sp.md,
    flexGrow:      1,
    flexShrink:    1,
    flexBasis:     200,
  },
  textButton: {
    minHeight:         sizes.tapTarget,
    minWidth:          sizes.tapTarget,
    paddingHorizontal: sp.sm,
    borderRadius:      radius.control,
    alignItems:        'center',
    justifyContent:    'center',
    marginLeft:        'auto',
  },
  listCard: {
    padding:           0,
    paddingHorizontal: sp.md,
  },
  cardHeading: {
    paddingTop:    sp.md,
    paddingBottom: sp.xs,
  },
  memberRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             sp.md,
    minHeight:       56,
    paddingVertical: sp.sm,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rolePill: {
    minHeight:         28,
    paddingHorizontal: sp.sm,
    borderRadius:      radius.pill,
    backgroundColor:   colors.indigoTint,
    alignItems:        'center',
    justifyContent:    'center',
  },
  inviteCard: {
    gap: sp.sm,
  },
  inviteHead: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    alignItems:    'center',
    columnGap:     sp.md,
  },
  inviteRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    alignItems:    'center',
    gap:           sp.md,
  },
  codeBox: {
    flexGrow:          1,
    flexShrink:        1,
    flexBasis:         160,
    minHeight:         sizes.tapTarget,
    paddingHorizontal: sp.md,
    paddingVertical:   sp.sm,
    borderRadius:      radius.field,
    backgroundColor:   colors.indigoTint,
    justifyContent:    'center',
  },
  code: {
    color:         colors.indigoDeep,
    letterSpacing: 2,
  },
  shareButton: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               sp.xs,
    minHeight:         sizes.adultButton,
    paddingHorizontal: sp.lg,
    borderRadius:      radius.control,
    borderWidth:       1.5,
    borderColor:       colors.indigo,
    backgroundColor:   colors.surface,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           sp.md,
    minHeight:     56,
  },
});

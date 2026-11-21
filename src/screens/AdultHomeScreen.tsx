import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import {
  buildAdultHomeModel,
  quickActionsStacked,
  reviewFullWidth,
  showDashboardSubtitle,
  type AttentionItem,
  type AttentionKind,
  type KidToday,
  type QuickAction,
  type QuickActionKey,
} from '@/features/adultHome/adultHomeModel';
import { useAdultHomeInput } from '@/features/adultHome/useAdultHomeInput';
import { useRubikReady } from '@/features/startup/fontLoader';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
import { selectCurrentUser, selectCurrentUserName } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, lockedSpacing as sp, lockedTextStyle, radius, rubikFamilyForWeight, sizes, type TypeScaleToken } from '@/theme';

// Slice 6A: Adult Home / Family Control Center (Board 06, adult tokens from
// Board 14). The screen only renders buildAdultHomeModel, in the board's
// order: header, Needs attention, Quick actions, Kids today.
//   - Every attention row's action is "Review". It opens the existing
//     review flow through onReview; no decision is made on this screen.
//   - Quick actions open the existing create forms through onQuickAction.
//   - The avatar opens Settings (the existing route) through onOpenSettings.
//   - Adult intensity: flat white cards with a 1dp hairline, radius 14, no
//     child depth edge, no illustrations in rows, 48dp controls, Rubik.
//   - Gold is not used here: nothing on this screen is a Points balance.
//     State is always a word plus an icon, never colour alone.
//   - No Recent activity (owner decision D3), no family progress metric,
//     no child Points, no ranking.
// The screen is navigation-free: the shell passes the callbacks in.

function useT() {
  const ready = useRubikReady();
  return (token: TypeScaleToken) => lockedTextStyle(token, ready);
}
// Shared with the other adult screens (Slice 6B Adult Tasks), so the adult
// type layer has one implementation.
export const useAdultText = useT;

// A 700 caption for the pills: the Rubik 700 family once loaded (a raw
// fontWeight on a custom family can fall back on Android), else the
// system font at 700.
export function useBoldCaption(): TextStyle {
  const ready = useRubikReady();
  const base = lockedTextStyle('caption', false);
  return ready
    ? { ...base, fontFamily: rubikFamilyForWeight('700'), fontWeight: 'normal' }
    : { ...base, fontWeight: '700' };
}

const KIND_ICON: Record<AttentionKind, keyof typeof Ionicons.glyphMap> = {
  mission_review:       'camera-outline',
  reward_request:       'gift-outline',
  helpful_contribution: 'heart-outline',
};

function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const t = useT();
  const user = useAppStore(selectCurrentUser);
  const name = useAppStore(selectCurrentUserName);
  const { height } = useWindowDimensions();
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onOpenSettings}
        accessibilityRole="button"
        accessibilityLabel={copy.navigation.openProfileA11y}
        style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}>
        <FamilyAvatar name={name ?? '?'} avatarUrl={user?.avatarUrl} avatarEmoji={user?.avatarEmoji} size={40} />
        <View style={styles.gearBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="settings-outline" size={12} color={colors.indigo} />
        </View>
      </Pressable>
      <View style={styles.flex}>
        <Text style={[t('h1'), styles.ink]} accessibilityRole="header">
          {name ? formatCopy(copy.adultHome.greeting, { name }) : copy.adultHome.greetingNoName}
        </Text>
        {showDashboardSubtitle(height) ? (
          <Text style={[t('caption'), styles.muted]}>{copy.adultHome.subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}

function CountPill({ count }: { count: number }) {
  const boldCaption = useBoldCaption();
  return (
    <View
      style={styles.countPill}
      accessible
      accessibilityLabel={count === 1 ? copy.adultHome.attentionOneA11y : formatCopy(copy.adultHome.attentionCountA11y, { n: count })}>
      <Text style={[boldCaption, styles.waitingInk]}>{count}</Text>
    </View>
  );
}

function AttentionRow({ item, first, fullWidth, onReview }: {
  item: AttentionItem; first: boolean; fullWidth: boolean; onReview: (item: AttentionItem) => void;
}) {
  const t = useT();
  const isMission = item.kind === 'mission_review';
  return (
    <View style={[styles.row, !first && styles.rowDivider, fullWidth && styles.rowWrap]}>
      <View style={[styles.rowMain, fullWidth && styles.rowMainFull]} accessible accessibilityLabel={item.a11yLabel}>
        <View style={[styles.kindIcon, isMission ? styles.kindIconWaiting : styles.kindIconIndigo]}>
          <Ionicons name={KIND_ICON[item.kind]} size={20} color={isMission ? colors.waiting : colors.indigo} />
        </View>
        <View style={styles.flex}>
          <Text style={[t('title'), styles.ink]}>{item.heading}</Text>
          <Text style={[t('caption'), styles.muted]}>
            {item.meta ? `${item.typeLabel} · ${item.meta}` : item.typeLabel}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => onReview(item)}
        accessibilityRole="button"
        accessibilityLabel={item.ctaA11yLabel}
        accessibilityHint={item.ctaA11yHint}
        style={({ pressed }) => [styles.reviewButton, fullWidth && styles.fullWidth, pressed && styles.outlinePressed]}>
        <Text style={[t('title'), styles.indigoInk]}>{item.cta}</Text>
      </Pressable>
    </View>
  );
}

function NeedsAttention({ items, count, onReview }: {
  items: AttentionItem[]; count: number; onReview: (item: AttentionItem) => void;
}) {
  const t = useT();
  const { width, fontScale } = useWindowDimensions();
  const fullWidth = reviewFullWidth(width, fontScale);
  return (
    <Card density="adult" style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={[t('h2'), styles.ink, styles.flex]} accessibilityRole="header">{copy.adultHome.needsAttention}</Text>
        {count > 0 ? <CountPill count={count} /> : null}
      </View>
      {items.length === 0 ? (
        <View style={styles.row} accessible accessibilityLabel={copy.adultHome.allClear}>
          <View style={[styles.kindIcon, styles.kindIconSuccess]}>
            <Ionicons name="checkmark" size={20} color={colors.success} />
          </View>
          <Text style={[t('body'), styles.muted, styles.flex]}>{copy.adultHome.allClear}</Text>
        </View>
      ) : (
        items.map((item, i) => (
          <AttentionRow key={`${item.kind}:${item.id}`} item={item} first={i === 0} fullWidth={fullWidth} onReview={onReview} />
        ))
      )}
    </Card>
  );
}

function QuickActions({ actions, onQuickAction }: { actions: QuickAction[]; onQuickAction: (key: QuickActionKey) => void }) {
  const t = useT();
  const { width, fontScale } = useWindowDimensions();
  const stacked = quickActionsStacked(width, fontScale);
  if (actions.length === 0) return null;
  return (
    <View style={[styles.quickRow, stacked && styles.quickStacked]}>
      {actions.map((a, i) => {
        const primary = i === 0;
        return (
          <Pressable
            key={a.key}
            onPress={() => onQuickAction(a.key)}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            accessibilityHint={a.a11yHint}
            style={({ pressed }) => [
              styles.quickButton,
              !stacked && styles.flex,
              primary ? styles.quickPrimary : styles.quickOutline,
              pressed && (primary ? styles.primaryPressed : styles.outlinePressed),
            ]}>
            <Ionicons name="add" size={20} color={primary ? colors.textOnColor : colors.indigo} />
            <Text style={[t('title'), primary ? styles.onIndigo : styles.indigoInk]}>{a.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function KidRow({ kid, first }: { kid: KidToday; first: boolean }) {
  const t = useT();
  const boldCaption = useBoldCaption();
  return (
    <View style={[styles.row, !first && styles.rowDivider]} accessible accessibilityLabel={kid.a11yLabel}>
      <FamilyAvatar name={kid.member.name} avatarUrl={kid.member.avatarUrl} avatarEmoji={kid.member.avatarEmoji} size={40} />
      <View style={styles.flex}>
        <Text style={[t('title'), styles.ink]}>{kid.member.name}</Text>
        <Text style={[t('caption'), styles.muted]}>{kid.progressLabel}</Text>
      </View>
      {kid.waitingLabel ? (
        <View style={styles.waitingPill}>
          <Ionicons name="time-outline" size={14} color={colors.waiting} />
          <Text style={[boldCaption, styles.waitingInk]}>{kid.waitingLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

function KidsToday({ kids }: { kids: KidToday[] }) {
  const t = useT();
  return (
    <Card density="adult" style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={[t('h2'), styles.ink, styles.flex]} accessibilityRole="header">{copy.adultHome.kidsToday}</Text>
      </View>
      {kids.length === 0 ? (
        <View style={styles.row}>
          <Text style={[t('body'), styles.muted, styles.flex]}>{copy.adultHome.noKids}</Text>
        </View>
      ) : (
        kids.map((kid, i) => <KidRow key={kid.member.userId} kid={kid} first={i === 0} />)
      )}
    </Card>
  );
}

export function AdultHomeScreen({ onOpenSettings, onReview, onQuickAction }: {
  onOpenSettings: () => void;
  onReview:       (item: AttentionItem) => void;
  onQuickAction:  (key: QuickActionKey) => void;
}) {
  const refreshControl = useHouseholdRefreshControl();
  const input = useAdultHomeInput();
  const model = useMemo(() => buildAdultHomeModel(input), [input]);

  return (
    <Screen style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}>
        <Header onOpenSettings={onOpenSettings} />
        <NeedsAttention items={model.attention.items} count={model.attention.count} onReview={onReview} />
        <QuickActions actions={model.quickActions} onQuickAction={onQuickAction} />
        <KidsToday kids={model.kids} />
      </ScrollView>
    </Screen>
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
  onIndigo: { color: colors.textOnColor },
  waitingInk: { color: colors.waiting },
  pressed: { opacity: 0.7 },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           sp.md,
    minHeight:     sizes.tapTarget,
  },
  avatarButton: {
    width:          sizes.tapTarget,
    height:         sizes.tapTarget,
    alignItems:     'center',
    justifyContent: 'center',
  },
  gearBadge: {
    position:        'absolute',
    right:           0,
    bottom:          0,
    width:           20,
    height:          20,
    borderRadius:    10,
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  card: {
    padding:           0,
    paddingHorizontal: sp.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           sp.sm,
    paddingTop:    sp.md,
    paddingBottom: sp.xs,
  },
  countPill: {
    minWidth:          28,
    minHeight:         28,
    paddingHorizontal: sp.sm,
    borderRadius:      radius.pill,
    backgroundColor:   colors.waitingSoft,
    alignItems:        'center',
    justifyContent:    'center',
  },
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             sp.md,
    minHeight:       56,
    paddingVertical: sp.sm,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowWrap: { flexWrap: 'wrap' },
  rowMain: {
    flex:          1,
    minWidth:      0,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           sp.md,
  },
  rowMainFull: { flexBasis: '100%' },
  kindIcon: {
    width:          36,
    height:         36,
    borderRadius:   radius.chip,
    alignItems:     'center',
    justifyContent: 'center',
  },
  kindIconWaiting: { backgroundColor: colors.waitingSoft },
  kindIconIndigo:  { backgroundColor: colors.indigoTint },
  kindIconSuccess: { backgroundColor: colors.successSoft },
  reviewButton: {
    minHeight:         sizes.adultButton,
    paddingHorizontal: sp.lg,
    borderRadius:      radius.control,
    borderWidth:       1.5,
    borderColor:       colors.indigo,
    backgroundColor:   colors.surface,
    alignItems:        'center',
    justifyContent:    'center',
  },
  fullWidth: { width: '100%' },
  outlinePressed: { backgroundColor: colors.indigoTint },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  quickRow: {
    flexDirection: 'row',
    gap:           sp.md,
  },
  quickStacked: { flexDirection: 'column' },
  quickButton: {
    minHeight:         sizes.adultButton,
    borderRadius:      radius.control,
    paddingHorizontal: sp.lg,
    paddingVertical:   sp.sm,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               sp.sm,
  },
  quickPrimary: { backgroundColor: colors.indigo },
  quickOutline: {
    backgroundColor: colors.surface,
    borderWidth:     1.5,
    borderColor:     colors.indigo,
  },
  waitingPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               sp.xs,
    minHeight:         28,
    paddingHorizontal: sp.sm,
    borderRadius:      radius.pill,
    backgroundColor:   colors.waitingSoft,
  },
});

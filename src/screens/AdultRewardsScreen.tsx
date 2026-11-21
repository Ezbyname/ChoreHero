import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import {
  buildAdultRewardsModel,
  requestActionFullWidth,
  type AdultRewardsInput,
  type RewardRequestRow,
  type RewardRow,
  type RewardState,
} from '@/features/adultRewards/adultRewardsModel';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
import { useAdultText, useBoldCaption } from '@/screens/AdultHomeScreen';
import {
  selectCanApproveRedemption,
  selectCanCreateRewards,
  selectCurrentHousehold,
  selectCurrentUser,
  selectRewardRedemptions,
  selectRewards,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, lockedSpacing as sp, radius, sizes } from '@/theme';

// Slice 6C: Adult Rewards (Board 10, adult tokens from Board 14).
// MANAGEMENT, NOT A SHOP: header (Rewards + New reward) → Requests →
// Rewards, all from buildAdultRewardsModel.
//   - Requests: each row's one action is "Review". It opens the Slice 6A
//     AdultReview route through onReview, which hosts the EXISTING reward
//     review (RedemptionReviewSection: confirmation, approve / reject
//     RPCs, stale handling). No decision is made here.
//   - Rewards: plain rows — name, optional description, cost (the only
//     gold), state as a word plus an icon. No illustrations, prize tiles,
//     progress, balances or rankings. No Edit / Archive (Board 11: future).
//   - New reward opens the Create Reward route through onNewReward, only
//     with rewards.create.
// The screen is navigation-free: the shell passes the callbacks in.

const STATE_ICON: Record<RewardState, keyof typeof Ionicons.glyphMap> = {
  active:  'checkmark-circle-outline',
  request: 'time-outline',
};

// Board 14 semantic tones: Active = success, Request = waiting amber.
const STATE_TONE: Record<RewardState, { bg: string; fg: string }> = {
  active:  { bg: colors.successSoft, fg: colors.success },
  request: { bg: colors.waitingSoft, fg: colors.waiting },
};

function useAdultRewardsInput(): AdultRewardsInput {
  const rewards          = useAppStore(selectRewards);
  const redemptions      = useAppStore(selectRewardRedemptions);
  const household        = useAppStore(selectCurrentHousehold);
  const user             = useAppStore(selectCurrentUser);
  const canReviewRewards = useAppStore(selectCanApproveRedemption);
  const canCreateRewards = useAppStore(selectCanCreateRewards);
  return useMemo(() => ({
    rewards,
    redemptions,
    members:     household?.members ?? [],
    viewerId:    user?.id ?? null,
    permissions: { canReviewRewards, canCreateRewards },
  }), [rewards, redemptions, household, user, canReviewRewards, canCreateRewards]);
}

function RequestRow({ row, first, fullWidth, onReview }: {
  row: RewardRequestRow; first: boolean; fullWidth: boolean; onReview: (id: string) => void;
}) {
  const t = useAdultText();
  const member = useAppStore((s) => (row.childId ? s.household?.members.find((m) => m.userId === row.childId) : undefined));
  return (
    <View style={[styles.row, !first && styles.rowDivider, !fullWidth && styles.rowInline]}>
      <View style={[styles.rowTop, !fullWidth && styles.flex]} accessible accessibilityLabel={row.a11yLabel}>
        <FamilyAvatar name={row.childName} avatarUrl={member?.avatarUrl} avatarEmoji={member?.avatarEmoji} size={32} />
        <View style={styles.flex}>
          <Text style={[t('title'), styles.ink]}>{row.rewardTitle}</Text>
          <Text style={[t('caption'), styles.muted]}>{row.subtitle}</Text>
        </View>
      </View>
      <Pressable
        onPress={() => onReview(row.id)}
        accessibilityRole="button"
        accessibilityLabel={row.ctaA11yLabel}
        accessibilityHint={row.ctaA11yHint}
        style={({ pressed }) => [styles.reviewButton, fullWidth && styles.fullWidth, pressed && styles.primaryPressed]}>
        <Text style={[t('title'), styles.onIndigo]}>{row.cta}</Text>
      </Pressable>
    </View>
  );
}

function StatePill({ state, label }: { state: RewardState; label: string }) {
  const boldCaption = useBoldCaption();
  const tone = STATE_TONE[state];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Ionicons name={STATE_ICON[state]} size={14} color={tone.fg} />
      <Text style={[boldCaption, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

function RewardListRow({ row, first }: { row: RewardRow; first: boolean }) {
  const t = useAdultText();
  const boldCaption = useBoldCaption();
  return (
    <View style={[styles.row, !first && styles.rowDivider]} accessible accessibilityLabel={row.a11yLabel}>
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <Text style={[t('title'), styles.ink]}>{row.title}</Text>
          {row.description ? <Text style={[t('caption'), styles.muted]}>{row.description}</Text> : null}
          {row.pendingLabel ? <Text style={[t('caption'), styles.waitingInk]}>{row.pendingLabel}</Text> : null}
        </View>
        <View style={styles.trailing}>
          <View style={styles.pointsPill}>
            <Text style={[boldCaption, styles.onGold]}>{row.pointsLabel}</Text>
          </View>
          <StatePill state={row.state} label={row.stateLabel} />
        </View>
      </View>
    </View>
  );
}

export function AdultRewardsScreen({ onReview, onNewReward }: {
  onReview:    (redemptionId: string) => void;
  onNewReward: () => void;
}) {
  const t = useAdultText();
  const refreshControl = useHouseholdRefreshControl();
  const input = useAdultRewardsInput();
  const model = useMemo(() => buildAdultRewardsModel(input), [input]);
  const { width, fontScale } = useWindowDimensions();
  const fullWidth = requestActionFullWidth(width, fontScale);

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={refreshControl}>
        <View style={styles.header}>
          <Text style={[t('h1'), styles.ink, styles.flex]} accessibilityRole="header">{copy.adultRewards.title}</Text>
          {model.canCreate ? (
            <Pressable
              onPress={onNewReward}
              accessibilityRole="button"
              accessibilityLabel={copy.adultRewards.newReward}
              accessibilityHint={copy.adultRewards.newRewardHint}
              style={({ pressed }) => [styles.newButton, pressed && styles.primaryPressed]}>
              <Ionicons name="add" size={20} color={colors.textOnColor} />
              <Text style={[t('title'), styles.onIndigo]}>{copy.adultRewards.newReward}</Text>
            </Pressable>
          ) : null}
        </View>

        {model.requests.visible ? (
          <Card density="adult" style={styles.card}>
            <Text style={[t('overline'), styles.muted, styles.cardHeading]} accessibilityRole="header" accessibilityLabel={model.requests.a11yLabel}>
              {model.requests.a11yLabel}
            </Text>
            {model.requests.rows.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.textSecondary} />
                <Text style={[t('body'), styles.muted, styles.flex]}>{copy.adultRewards.noRequests}</Text>
              </View>
            ) : (
              model.requests.rows.map((row, i) => (
                <RequestRow key={row.id} row={row} first={i === 0} fullWidth={fullWidth} onReview={onReview} />
              ))
            )}
          </Card>
        ) : null}

        <Card density="adult" style={styles.card}>
          <Text style={[t('overline'), styles.muted, styles.cardHeading]} accessibilityRole="header" accessibilityLabel={model.rewards.a11yLabel}>
            {model.rewards.a11yLabel}
          </Text>
          {model.rewards.rows.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="gift-outline" size={20} color={colors.textSecondary} />
              <Text style={[t('body'), styles.muted, styles.flex]}>
                {model.canCreate ? copy.adultRewards.noRewardsCreate : copy.adultRewards.noRewards}
              </Text>
            </View>
          ) : (
            model.rewards.rows.map((row, i) => <RewardListRow key={row.reward.id} row={row} first={i === 0} />)
          )}
        </Card>
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
  waitingInk: { color: colors.waiting },
  onIndigo: { color: colors.textOnColor },
  onGold: { color: colors.onGold },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
    gap:           sp.md,
    minHeight:     sizes.tapTarget,
  },
  newButton: {
    minHeight:         sizes.adultButton,
    paddingHorizontal: sp.lg,
    borderRadius:      radius.control,
    backgroundColor:   colors.indigo,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               sp.xs,
  },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  card: {
    padding:           0,
    paddingHorizontal: sp.md,
  },
  cardHeading: {
    paddingTop:    sp.md,
    paddingBottom: sp.xs,
  },
  emptyRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             sp.md,
    minHeight:       56,
    paddingVertical: sp.sm,
  },
  row: {
    minHeight:       56,
    paddingVertical: sp.md,
    gap:             sp.sm,
  },
  rowInline: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           sp.md,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           sp.md,
  },
  trailing: {
    alignItems: 'flex-end',
    gap:        sp.xs,
  },
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               sp.xs,
    minHeight:         28,
    paddingHorizontal: sp.sm,
    borderRadius:      radius.pill,
  },
  pointsPill: {
    minWidth:          32,
    minHeight:         28,
    paddingHorizontal: sp.sm,
    borderRadius:      radius.pill,
    backgroundColor:   colors.gold,
    alignItems:        'center',
    justifyContent:    'center',
  },
  reviewButton: {
    minHeight:         sizes.adultButton,
    paddingHorizontal: sp.lg,
    borderRadius:      radius.control,
    backgroundColor:   colors.indigo,
    alignItems:        'center',
    justifyContent:    'center',
  },
  fullWidth: { alignSelf: 'stretch' },
});

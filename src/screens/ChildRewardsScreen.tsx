import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import {
  buildChildRewardsModel,
  rewardGridColumns,
  walletDisplay,
  type AskedReward,
  type CollectedReward,
  type KeepGoingReward,
  type ReadyReward,
  type RewardWallet,
} from '@/features/childRewards/childRewardsModel';
import { CancelRewardRequestModal } from '@/features/rewards/components/CancelRewardRequestModal';
import { ConfirmRewardRequestModal } from '@/features/rewards/components/ConfirmRewardRequestModal';
import { useRewardRequestFlow } from '@/features/rewards/useRewardRequestFlow';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
import { ILLUSTRATION_PLACEHOLDER, useT } from '@/screens/ChildHomeScreen';
import {
  selectCanCancelRedemption,
  selectCanRequestRedemption,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectMyPointsBalance,
  selectRewardRedemptions,
  selectRewards,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, depth, lockedSpacing as sp, radius, sizes } from '@/theme';
import type { Reward } from '@/types';

// Slice 5D: Child Rewards (Board 04 "Child Rewards Final", Board 14 tokens).
// The child's Rewards tab. Adults keep RewardsScreen, unchanged.
//   - Every number and list comes from buildChildRewardsModel, which
//     composes the existing rewards rules. This screen only renders, in the
//     board's order: Points wallet, Suggested next reward, Ready to get,
//     Keep going, Asked for, My collection.
//   - Every action reuses the existing flow (useRewardRequestFlow, shared
//     with RewardCard): "Ask for it" opens ConfirmRewardRequestModal, then
//     the idempotent request RPC; "Changed my mind" opens
//     CancelRewardRequestModal, then the cancel RPC that returns the held
//     Points.
//   - Gold marks Points and rewards only (wallet, coin, "Ask for it",
//     progress toward a reward). Asked for is calm amber, My collection is
//     quiet success. State is always in text and an icon, never colour only.
//   - Only the viewer's own Points, requests and collection: no family
//     Points list and no ranking.
//   - Reward art is the shared placeholder (ILLUSTRATION_PLACEHOLDER.reward),
//     the same generic glyph for every reward, never guessed from a title.

function RewardBubble({ size = 56, locked = false }: { size?: number; locked?: boolean }) {
  return (
    <View
      style={[styles.bubble, locked && styles.bubbleLocked, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Ionicons name={ILLUSTRATION_PLACEHOLDER.reward} size={Math.round(size * 0.5)} color={locked ? colors.indigo : colors.goldDeep} />
      {locked ? (
        <View style={styles.lockMark}><Ionicons name="lock-closed" size={12} color={colors.indigo} /></View>
      ) : null}
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
    </View>
  );
}

function SectionTitle({ text }: { text: string }) {
  const t = useT();
  return <Text style={[t('overline'), styles.mutedText]} accessibilityRole="header">{text}</Text>;
}

function WalletCard({ wallet }: { wallet: RewardWallet }) {
  const t = useT();
  const d = walletDisplay(wallet);
  return (
    <View style={styles.wallet} accessible accessibilityRole="text" accessibilityLabel={d.a11y}>
      <View style={styles.flex}>
        <Text style={[t('overline'), styles.walletInk]}>{copy.childRewards.walletTitle}</Text>
        <View style={[styles.row, styles.wrap, { alignItems: 'baseline', gap: sp.sm }]}>
          <Text style={[t('display'), styles.walletNumber]}>{d.big}</Text>
          <Text style={[t('title'), styles.walletInk]}>{copy.childRewards.walletUnit}</Text>
        </View>
        {d.line ? <Text style={[t('caption'), styles.walletInk]}>{d.line}</Text> : null}
      </View>
      <View style={styles.walletArt}>
        <Ionicons name={ILLUSTRATION_PLACEHOLDER.reward} size={36} color={colors.indigo} />
      </View>
    </View>
  );
}

function SuggestedCard({ item }: { item: KeepGoingReward }) {
  const t = useT();
  return (
    <Card density="child" style={styles.suggested}>
      <View
        style={[styles.row, { gap: sp.md }]}
        accessible
        accessibilityLabel={`${copy.childRewards.suggested}: ${item.reward.title}. ${formatCopy(copy.childRewards.toGoA11y, { n: item.toGo })}`}>
        <RewardBubble />
        <View style={styles.flex}>
          <Text style={[t('overline'), styles.mutedText]}>{copy.childRewards.suggested}</Text>
          <View style={[styles.row, styles.wrap, { gap: sp.sm }]}>
            <Text style={[t('title'), styles.inkText, styles.flex]}>{item.reward.title}</Text>
            <Text style={[t('caption'), styles.mutedText]}>{formatCopy(copy.childRewards.toGo, { n: item.toGo })}</Text>
          </View>
          <ProgressBar progress={item.progress} />
        </View>
      </View>
    </Card>
  );
}

type FlowContext = {
  free:        number;
  canRequest:  boolean;
  householdId: string;
  viewerId:    string;
  role:        string | null;
};

function ReadyTile({ item, ctx, width }: { item: ReadyReward; ctx: FlowContext; width: number | undefined }) {
  const t = useT();
  const flow = useRewardRequestFlow({
    reward: item.reward, viewerBalance: ctx.free, canRequest: ctx.canRequest, pendingRedemption: undefined,
    householdId: ctx.householdId, requestedByProfileId: ctx.viewerId, role: ctx.role,
  });
  return (
    <Card density="child" style={[styles.tile, width ? { width } : styles.fullTile]}>
      <View style={styles.tileTop} accessible accessibilityLabel={formatCopy(copy.childRewards.readyA11y, { title: item.reward.title, n: item.cost })}>
        <RewardBubble size={64} />
        <Text style={[t('title'), styles.inkText, styles.center]}>{item.reward.title}</Text>
      </View>
      {ctx.canRequest ? (
        <AppButton
          label={formatCopy(copy.childRewards.askFor, { n: item.cost })}
          variant="gold"
          density="child"
          compact
          onPress={flow.openConfirm}
          disabled={!flow.requestAvailable}
          busy={flow.isSubmitting}
          accessibilityHint={formatCopy(copy.childRewards.askForA11y, { title: item.reward.title, n: item.cost })}
          style={styles.tileCta}
        />
      ) : null}
      {flow.feedback ? <Banner tone="danger" text={flow.feedback} /> : null}
      <ConfirmRewardRequestModal
        visible={flow.confirmVisible}
        rewardTitle={item.reward.title}
        requiredPoints={item.cost}
        onConfirm={flow.confirmRequest}
        onCancel={flow.closeConfirm}
      />
    </Card>
  );
}

function KeepGoingTile({ item, width }: { item: KeepGoingReward; width: number | undefined }) {
  const t = useT();
  return (
    <Card density="child" style={[styles.tile, width ? { width } : styles.fullTile]}>
      <View
        style={styles.tileTop}
        accessible
        accessibilityLabel={formatCopy(copy.childRewards.lockedA11y, { title: item.reward.title, n: item.cost, toGo: item.toGo })}>
        <RewardBubble size={64} locked />
        <Text style={[t('title'), styles.inkText, styles.center]}>{item.reward.title}</Text>
        <View style={[styles.row, { gap: sp.xs }]}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
          <Text style={[t('caption'), styles.mutedText]}>{formatCopy(copy.childRewards.toGo, { n: item.toGo })}</Text>
        </View>
      </View>
      <ProgressBar progress={item.progress} />
    </Card>
  );
}

function AskedRow({ item, ctx, canCancel }: { item: AskedReward; ctx: FlowContext; canCancel: boolean }) {
  const t = useT();
  const title = item.reward?.title ?? copy.childRewards.unknownReward;
  // The flow needs a Reward; for a reward no longer in the store only the
  // cancel half is used, which reads nothing but the redemption.
  const reward: Reward = item.reward ?? {
    id: item.redemption.rewardId, householdId: item.redemption.householdId, title,
    requiredPoints: item.redemption.pointsRequiredSnapshot, isActive: false,
  };
  const flow = useRewardRequestFlow({
    reward, viewerBalance: ctx.free, canRequest: false, pendingRedemption: item.redemption,
    householdId: ctx.householdId, requestedByProfileId: ctx.viewerId, role: ctx.role,
  });
  return (
    <View style={styles.asked}>
      <View style={[styles.row, { gap: sp.md }]} accessible accessibilityLabel={formatCopy(copy.childRewards.askedA11y, { title })
        + (item.held > 0 ? ` ${formatCopy(copy.childRewards.askedHeld, { n: item.held })}.` : '')}>
        <View style={styles.askedBubble}><Ionicons name="time-outline" size={22} color={colors.waiting} /></View>
        <View style={styles.flex}>
          <Text style={[t('title'), styles.inkText]}>{title}</Text>
          <Text style={[t('caption'), styles.waitingText]}>{copy.childRewards.askedState}</Text>
          {item.held > 0 ? (
            <Text style={[t('caption'), styles.waitingText]}>{formatCopy(copy.childRewards.askedHeld, { n: item.held })}</Text>
          ) : null}
        </View>
      </View>
      {canCancel ? (
        <AppButton
          label={copy.childRewards.changedMind}
          variant="secondary"
          density="child"
          compact
          busy={flow.isCancelling}
          onPress={flow.openCancel}
          accessibilityHint={formatCopy(copy.childRewards.changedMindA11y, { title })}
        />
      ) : null}
      {flow.cancelFeedback ? <Banner tone="danger" text={flow.cancelFeedback} /> : null}
      <CancelRewardRequestModal
        visible={flow.cancelVisible}
        pendingPoints={item.redemption.pointsRequiredSnapshot}
        onKeepRequest={flow.closeCancel}
        onCancelRequest={flow.confirmCancel}
      />
    </View>
  );
}

function CollectionRow({ item, first }: { item: CollectedReward; first: boolean }) {
  const t = useT();
  const a11y = item.count > 1
    ? formatCopy(copy.childRewards.collectionA11y, { title: item.reward.title, n: item.count })
    : formatCopy(copy.childRewards.collectionA11yOnce, { title: item.reward.title });
  return (
    <View style={[styles.collectionRow, !first && styles.rowDivider]} accessible accessibilityLabel={a11y}>
      <View style={styles.collectionTile}><Ionicons name={ILLUSTRATION_PLACEHOLDER.reward} size={22} color={colors.success} /></View>
      <Text style={[t('title'), styles.inkText, styles.flex]}>{item.reward.title}</Text>
      {item.count > 1 ? (
        <Text style={[t('caption'), styles.successText]}>{formatCopy(copy.childRewards.collectionCount, { n: item.count })}</Text>
      ) : null}
      <Ionicons name="checkmark-circle" size={22} color={colors.success} />
    </View>
  );
}

export function ChildRewardsScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const refreshControl = useHouseholdRefreshControl();
  const rewards     = useAppStore(selectRewards);
  // Raw, stable store array: filtered in the model, never in a selector.
  const redemptions = useAppStore(selectRewardRedemptions);
  const myBalance   = useAppStore(selectMyPointsBalance);
  const household   = useAppStore(selectCurrentHousehold);
  const user        = useAppStore(selectCurrentUser);
  const role        = useAppStore(selectCurrentMemberRole);
  const canRequest  = useAppStore(selectCanRequestRedemption);
  const canCancel   = useAppStore(selectCanCancelRedemption);
  const viewerId    = user?.id ?? '';

  const model = useMemo(
    () => buildChildRewardsModel({ rewards, redemptions, viewerId, grossBalance: myBalance?.balance ?? 0 }),
    [rewards, redemptions, viewerId, myBalance],
  );
  const { wallet, suggested, ready, keepGoing, asked, collection, noRewards } = model;

  const ctx: FlowContext = { free: wallet.free, canRequest, householdId: household?.id ?? '', viewerId, role };
  const columns = rewardGridColumns(width, fontScale);
  const tileWidth = columns === 2 ? Math.floor((width - sp.lg * 2 - sp.md) / 2) : undefined;

  return (
    <Screen style={styles.screen} edges={SCREEN_EDGES}>
      <ScrollView
        style={styles.ground}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}>

        <View style={[styles.band, { paddingTop: insets.top + sp.sm }]}>
          <Text style={[t('h1'), styles.onColorText, styles.flex]} accessibilityRole="header">{copy.childRewards.title}</Text>
          <View
            style={styles.coin}
            accessible
            accessibilityRole="text"
            accessibilityLabel={formatCopy(copy.childHome.pointsA11y, { n: wallet.free })}>
            <View style={styles.coinFace}><Ionicons name="star" size={14} color={colors.goldDeep} /></View>
            <Text style={[t('h2'), styles.onGoldText]}>{wallet.free}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <WalletCard wallet={wallet} />

          {suggested ? <SuggestedCard item={suggested} /> : null}

          {noRewards ? (
            <Card density="child" style={styles.emptyCard}>
              <View style={styles.emptyBubble}><Ionicons name="gift-outline" size={34} color={colors.indigo} /></View>
              <Text style={[t('h2'), styles.inkText, styles.center]}>{copy.childRewards.noRewardsTitle}</Text>
              <Text style={[t('caption'), styles.mutedText, styles.center]}>{copy.childRewards.noRewardsBody}</Text>
            </Card>
          ) : null}

          {ready.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle text={copy.childRewards.readyTitle} />
              <View style={styles.grid}>
                {ready.map((item) => <ReadyTile key={item.reward.id} item={item} ctx={ctx} width={tileWidth} />)}
              </View>
            </View>
          ) : !noRewards && (keepGoing.length > 0 || suggested) ? (
            <Text style={[t('caption'), styles.mutedText]}>{copy.childRewards.nothingReady}</Text>
          ) : null}

          {keepGoing.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle text={copy.childRewards.keepGoingTitle} />
              <View style={styles.grid}>
                {keepGoing.map((item) => <KeepGoingTile key={item.reward.id} item={item} width={tileWidth} />)}
              </View>
            </View>
          ) : null}

          {asked.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle text={copy.childRewards.askedTitle} />
              {asked.map((item) => <AskedRow key={item.redemption.id} item={item} ctx={ctx} canCancel={canCancel} />)}
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionTitle text={copy.childRewards.collectionTitle} />
            {collection.length > 0 ? (
              <Card density="child" style={styles.collectionCard}>
                {collection.map((item, i) => <CollectionRow key={item.reward.id} item={item} first={i === 0} />)}
              </Card>
            ) : (
              <View style={styles.collectionEmpty}>
                <Ionicons name="gift-outline" size={20} color={colors.textSecondary} />
                <Text style={[t('caption'), styles.mutedText, styles.flex]}>{copy.childRewards.collectionEmpty}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      {/* The header band draws under the status bar; this scrim keeps
          scrolled content from showing through it (as on Missions). */}
      {insets.top > 0 ? <View style={[styles.statusScrim, { height: insets.top }]} /> : null}
    </Screen>
  );
}

const SCREEN_EDGES = ['left', 'right'] as const;

const styles = StyleSheet.create({
  screen:  { paddingHorizontal: 0, backgroundColor: colors.indigoTint },
  ground:  { backgroundColor: colors.indigoTint },
  content: { paddingBottom: sp.xxl },
  flex:    { flex: 1, minWidth: 0 },
  row:     { flexDirection: 'row', alignItems: 'center' },
  wrap:    { flexWrap: 'wrap' },
  center:  { textAlign: 'center' },

  inkText:     { color: colors.ink },
  mutedText:   { color: colors.textSecondary },
  onColorText: { color: colors.textOnColor },
  onGoldText:  { color: colors.onGold },
  waitingText: { color: colors.waiting },
  successText: { color: colors.success },
  walletInk:   { color: colors.onGold },
  walletNumber: { color: colors.onGold },

  statusScrim: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    backgroundColor: colors.childHeader,
    pointerEvents:   'none',
  },
  band: {
    backgroundColor:         colors.childHeader,
    paddingHorizontal:       sp.lg,
    paddingBottom:           sp.lg,
    borderBottomLeftRadius:  radius.sheet - 4,
    borderBottomRightRadius: radius.sheet - 4,
    flexDirection:           'row',
    alignItems:              'center',
    gap:                     sp.md,
  },
  coin: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             sp.sm,
    minHeight:       40,
    paddingLeft:     sp.sm,
    paddingRight:    sp.md,
    borderRadius:    radius.pill,
    backgroundColor: colors.gold,
    ...depth.goldButton,
  },
  coinFace: {
    width:           24,
    height:          24,
    borderRadius:    12,
    backgroundColor: colors.waitingSoft,
    alignItems:      'center',
    justifyContent:  'center',
  },

  body:    { paddingHorizontal: sp.lg, paddingTop: sp.lg, gap: sp.lg },
  section: { gap: sp.sm },
  grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: sp.md },

  // Board 04 wallet: the gold Points card with depth.
  wallet: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             sp.md,
    padding:         sp.md,
    borderRadius:    radius.childCard + 2,
    backgroundColor: colors.gold,
    ...depth.goldButton,
  },
  walletArt: {
    width:           64,
    height:          64,
    borderRadius:    20,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },

  suggested: { paddingVertical: sp.sm + 2, paddingHorizontal: sp.md },
  bubble: {
    backgroundColor: colors.waitingSoft,
    borderWidth:     2,
    borderColor:     colors.gold,
    alignItems:      'center',
    justifyContent:  'center',
  },
  bubbleLocked: { backgroundColor: colors.indigoTint, borderColor: colors.border },
  lockMark: {
    position:        'absolute',
    right:           -2,
    bottom:          -2,
    width:           22,
    height:          22,
    borderRadius:    11,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },
  bar:     { height: 10, borderRadius: radius.pill, backgroundColor: colors.childTrack, overflow: 'hidden', marginTop: sp.sm, alignSelf: 'stretch' },
  barFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },

  tile:     { padding: sp.md, gap: sp.sm, alignItems: 'center' },
  fullTile: { alignSelf: 'stretch', width: '100%' },
  tileTop:  { alignItems: 'center', gap: sp.sm, alignSelf: 'stretch' },
  tileCta:  { alignSelf: 'stretch', minHeight: sizes.tapTarget },

  // Asked for: calm amber, like a Waiting mission.
  asked: {
    gap:             sp.sm,
    padding:         sp.md,
    borderRadius:    radius.childCard,
    backgroundColor: colors.waitingSoft,
  },
  askedBubble: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // My collection: quiet success rows, no celebration.
  collectionCard: { paddingVertical: sp.xs, paddingHorizontal: sp.md },
  collectionRow:  { flexDirection: 'row', alignItems: 'center', gap: sp.md, minHeight: 56, paddingVertical: sp.sm },
  rowDivider:     { borderTopWidth: 1, borderTopColor: colors.border },
  collectionTile: {
    width:           40,
    height:          40,
    borderRadius:    12,
    backgroundColor: colors.successSoft,
    alignItems:      'center',
    justifyContent:  'center',
  },
  collectionEmpty: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               sp.sm,
    minHeight:         sizes.tapTarget,
    paddingHorizontal: sp.md,
    borderRadius:      radius.childCard,
    borderWidth:       2,
    borderStyle:       'dashed',
    borderColor:       colors.border,
  },

  emptyCard:   { alignItems: 'center', gap: sp.sm, paddingVertical: sp.xxl },
  emptyBubble: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: colors.indigoTint,
    alignItems:      'center',
    justifyContent:  'center',
  },
});

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { resolveViewerTimeZone } from '@/domain/localDay';
import {
  buildChildHomeModel,
  heroRibbonTone,
  isCompactHeight,
  MAX_FAMILY_DOTS,
  MAX_PROGRESS_SEGMENTS,
  progressRatio,
  rewardRatio,
  type ChildHomeHero,
  type ChildHomeMission,
} from '@/features/childHome/childHomeModel';
import { childText, type ChildTypeToken } from '@/features/childHome/childType';
import { appSounds } from '@/features/sounds/appSounds';
import { useRubikReady } from '@/features/startup/fontLoader';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
import { claimOpenTask } from '@/features/tasks/claimOpenTask';
import { PendingCompletionModal, type PendingCompletionModalTask } from '@/features/tasks/components/PendingCompletionModal';
import { TaskCompletionModal, type TaskCompletionModalTask } from '@/features/tasks/components/TaskCompletionModal';
import { ClaimContributionForm } from '@/screens/TodayScreen';
import {
  selectCanClaimContribution,
  selectContributionClaims,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectCurrentUserName,
  selectMyPointsBalance,
  selectRewardRedemptions,
  selectRewards,
  selectTasks,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, depth, lockedSpacing as sp, radius, sizes } from '@/theme';
import type { Task } from '@/types';

// Slice 5A: Child Home (Board 02 "Child Home Final", Board 14 tokens).
//   - Every number comes from buildChildHomeModel, which composes the
//     approved Slice 1 selectors. This screen only renders.
//   - Every action reuses the existing flow:
//       - TaskCompletionModal: the child's request with photos
//       - claimOpenTask
//       - PendingCompletionModal: Change photos / Cancel
//       - the existing Helpful claim form
//   - Rubik is used here when ready (Slice 3), with the same layout on the
//     system font.
//   - Illustrations: no production art assets exist yet, so MissionArt is
//     a clearly marked placeholder. It is the same generic glyph for every
//     mission, never guessed from a task title.
//   - The screen never navigates.

// Implementation placeholder for the approved illustration language. One
// generic glyph per surface, so the layout matches the boards until real
// art assets land.
export const ILLUSTRATION_PLACEHOLDER = {
  mission: 'flag',
  reward:  'gift',
  allDone: 'trophy',
  waiting: 'time-outline',
  empty:   'flag-outline',
} as const satisfies Record<string, keyof typeof Ionicons.glyphMap>;

export function MissionArt({ kind, size, glyph, onCard = false }: { kind: keyof typeof ILLUSTRATION_PLACEHOLDER; size: number; glyph: number; onCard?: boolean }) {
  return (
    <View
      style={[styles.art, onCard && styles.artOnCard, { width: size, height: size, borderRadius: size * 0.24 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Ionicons name={ILLUSTRATION_PLACEHOLDER[kind]} size={glyph} color={colors.childHero} />
    </View>
  );
}

export function useT() {
  const ready = useRubikReady();
  return (token: ChildTypeToken) => childText(token, ready);
}

export function PointsPill({ points, short = false }: { points: number; short?: boolean }) {
  const t = useT();
  return (
    <View style={styles.pointsPill}>
      <Text style={[t('caption'), styles.onGoldText]}>
        {formatCopy(short ? copy.childHome.pointsPillShort : copy.childHome.pointsPill, { n: points })}
      </Text>
    </View>
  );
}

// The mission card at the top of the child Submit Evidence screen (Board 20).
// Child Home, Child Missions and Mission Details all pass it, so every child
// flow shows the same context. Lives here (not in Mission Details) so the
// Child Home can use it without a require cycle.
export function EvidenceMissionCard({ title, dueLabel, points }: { title: string; dueLabel: string | null; points: number | null }) {
  const t = useT();
  return (
    <Card density="child" style={styles.evidenceCard}>
      <View style={[styles.row, { gap: sp.md }]}>
        <MissionArt kind="mission" size={56} glyph={30} onCard />
        <View style={styles.flex}>
          <Text style={[t('h2'), styles.inkText]}>{title}</Text>
          {dueLabel ? <Text style={[t('caption'), styles.mutedText]}>{dueLabel}</Text> : null}
        </View>
        {points ? <PointsPill points={points} short /> : null}
      </View>
    </Card>
  );
}

function ProgressSegments({ done, total, onBand = false, thin = false }: { done: number; total: number; onBand?: boolean; thin?: boolean }) {
  const track = onBand ? colors.onChildTrack : colors.childTrack;
  if (total > MAX_PROGRESS_SEGMENTS || thin) {
    return (
      <View style={[styles.bar, { height: thin ? 6 : 10, backgroundColor: track }]}>
        <View style={[styles.barFill, { width: `${progressRatio({ completed: done, total }) * 100}%`, backgroundColor: colors.success }]} />
      </View>
    );
  }
  return (
    <View style={styles.segments}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.segment, i < done ? styles.segmentDone : { backgroundColor: track }]}>
          {i < done ? <Ionicons name="checkmark" size={16} color={colors.textOnColor} /> : null}
        </View>
      ))}
    </View>
  );
}

const RIBBON: Record<string, string> = {
  sent_back:      copy.childHome.ribbonSentBack,
  open_to_anyone: copy.childHome.ribbonOpen,
  overdue:        copy.childHome.ribbonOverdue,
};

const CTA_LABEL: Record<ChildHomeMission['action'], string> = {
  complete: copy.childHome.ctaComplete,
  retry:    copy.childHome.ctaRetry,
  claim:    copy.childHome.ctaClaim,
  manage:   copy.childHome.ctaComplete,
};

function Hero({ hero, name, busy, onAction }: { hero: ChildHomeHero; name: string; busy: boolean; onAction: (m: ChildHomeMission) => void }) {
  const t = useT();
  if (hero.kind === 'mission') {
    const { mission, reason } = hero;
    const tone = heroRibbonTone(reason);
    return (
      <View style={styles.hero}>
        <View style={styles.row}>
          <View style={[styles.ribbon, tone === 'indigo' && styles.ribbonSentBack, tone === 'warning' && styles.ribbonOverdue]}>
            <Text style={[t('overline'), tone === 'indigo' ? styles.indigoDeepText : styles.onColorText]}>
              {RIBBON[reason] ?? copy.childHome.ribbonReady}
            </Text>
          </View>
          <View style={styles.flex} />
          {mission.points ? <PointsPill points={mission.points} /> : null}
        </View>
        <View style={[styles.row, { gap: sp.md }]}>
          <MissionArt kind="mission" size={76} glyph={40} />
          <View style={styles.flex}>
            <Text style={[t('h1'), styles.onColorText]}>{mission.task.title}</Text>
            {mission.task.description ? <Text style={[t('caption'), styles.onColorSoftText]} numberOfLines={2}>{mission.task.description}</Text> : null}
            {mission.dueLabel ? <Text style={[t('caption'), styles.onColorSoftText]}>{mission.dueLabel}</Text> : null}
          </View>
        </View>
        <AppButton
          label={CTA_LABEL[mission.action]}
          variant="primary"
          density="child"
          busy={busy}
          onPress={() => onAction(mission)}
        />
      </View>
    );
  }
  if (hero.kind === 'waiting') {
    return (
      <Card density="child" style={styles.stateCard}>
        <View style={[styles.stateBubble, { backgroundColor: colors.waitingSoft }]}>
          <Ionicons name={ILLUSTRATION_PLACEHOLDER.waiting} size={36} color={colors.waiting} />
        </View>
        <Text style={[t('h2'), styles.inkText, styles.center]}>{copy.childHome.waitingTitle}</Text>
        <Text style={[t('caption'), styles.mutedText, styles.center]}>
          {hero.pendingCount === 1 ? copy.childHome.waitingBodyOne : formatCopy(copy.childHome.waitingBody, { n: hero.pendingCount })}
        </Text>
      </Card>
    );
  }
  if (hero.allDone) {
    return (
      <View style={[styles.hero, styles.stateHero]}>
        <View style={styles.stateBubble}><MissionArt kind="allDone" size={72} glyph={40} /></View>
        <Text style={[t('h2'), styles.onColorText, styles.center]}>{copy.childHome.allDoneTitle}</Text>
        <Text style={[t('caption'), styles.onColorSoftText, styles.center]}>{formatCopy(copy.childHome.allDoneBody, { name })}</Text>
      </View>
    );
  }
  return (
    <Card density="child" style={styles.stateCard}>
      <View style={styles.stateBubble}><MissionArt kind="empty" size={72} glyph={40} /></View>
      <Text style={[t('h2'), styles.inkText, styles.center]}>{copy.childHome.emptyTitle}</Text>
      <Text style={[t('caption'), styles.mutedText, styles.center]}>{copy.childHome.emptyBody}</Text>
    </Card>
  );
}

function SecondaryRow({ mission, busy, onAction }: { mission: ChildHomeMission; busy: boolean; onAction: (m: ChildHomeMission) => void }) {
  const t = useT();
  if (mission.action === 'manage') {
    return (
      <Pressable
        onPress={() => onAction(mission)}
        style={({ pressed }) => [styles.waitingRow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityHint={copy.childHome.waitingRowHint}>
        <Ionicons name="time-outline" size={18} color={colors.waiting} />
        <Text style={[t('caption'), styles.waitingText, styles.flex]}>{formatCopy(copy.childHome.waitingRow, { title: mission.task.title })}</Text>
      </Pressable>
    );
  }
  const sub = mission.action === 'claim'
    ? copy.childHome.openToAnyone
    : mission.action === 'retry' ? copy.childHome.sentBack : mission.dueLabel;
  const body = (
    <>
      <MissionArt kind="mission" size={44} glyph={24} onCard />
      <View style={styles.flex}>
        <Text style={[t('title'), styles.inkText]}>{mission.task.title}</Text>
        {sub ? <Text style={[t('caption'), styles.mutedText]}>{sub}</Text> : null}
      </View>
      {mission.points ? <PointsPill points={mission.points} short /> : null}
    </>
  );
  if (mission.action === 'claim') {
    return (
      <Card density="child" style={styles.mini}>
        <View style={[styles.row, { gap: sp.sm + 2 }]}>{body}</View>
        <AppButton label={copy.childHome.ctaClaim} variant="secondary" density="child" compact busy={busy} onPress={() => onAction(mission)} />
      </Card>
    );
  }
  return (
    <Pressable
      onPress={() => onAction(mission)}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${mission.task.title}. ${mission.action === 'retry' ? copy.childHome.ctaRetry : copy.childHome.ctaComplete}`}
      accessibilityHint={copy.childHome.openMissionHint}>
      {({ pressed }) => (
        <Card density="child" style={[styles.mini, pressed && styles.pressed]}>
          <View style={[styles.row, { gap: sp.sm + 2 }]}>
            {body}
            <View style={styles.go}><Ionicons name="chevron-forward" size={22} color={colors.indigo} /></View>
          </View>
        </Card>
      )}
    </Pressable>
  );
}

export function ChildHomeScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = isCompactHeight(height);
  const refreshControl = useHouseholdRefreshControl();

  const tasks           = useAppStore(selectTasks);
  const taskSubmissions = useAppStore((s) => s.taskSubmissions);
  const rewards         = useAppStore(selectRewards);
  const redemptions     = useAppStore(selectRewardRedemptions);
  const myBalance       = useAppStore(selectMyPointsBalance);
  const household       = useAppStore(selectCurrentHousehold);
  const user            = useAppStore(selectCurrentUser);
  const name            = useAppStore(selectCurrentUserName) ?? '';
  const role            = useAppStore(selectCurrentMemberRole);
  const canClaim        = useAppStore(selectCanClaimContribution);
  const contributionClaims = useAppStore(selectContributionClaims);

  // The minute is enough: the selectors classify by local day.
  const nowKey = Math.floor(Date.now() / 60_000);
  const model = useMemo(
    () => buildChildHomeModel({
      tasks, taskSubmissions, rewards, redemptions,
      grossBalance: myBalance?.balance ?? 0,
      childId:      user?.id ?? '',
      now:          new Date(nowKey * 60_000),
      timeZone:     resolveViewerTimeZone(),
    }),
    [tasks, taskSubmissions, rewards, redemptions, myBalance, user?.id, nowKey],
  );

  const myPendingClaimTitle = useMemo(() => {
    if (!user) return null;
    const mine = contributionClaims.find((c) => c.claimedByProfileId === user.id && c.status === 'pending');
    return mine ? mine.title : null;
  }, [contributionClaims, user]);

  const [busyId, setBusyId]                     = useState<string | null>(null);
  const [feedback, setFeedback]                 = useState<string | null>(null);
  const [completionTarget, setCompletionTarget] = useState<TaskCompletionModalTask | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [completionCard, setCompletionCard]     = useState<{ title: string; dueLabel: string | null; points: number | null } | null>(null);
  const [pendingTarget, setPendingTarget]       = useState<PendingCompletionModalTask | null>(null);

  // The same branches the child's Today used (see TodayScreen.handleTaskAction).
  async function handleAction(mission: ChildHomeMission) {
    if (busyId || !household || !user) return;
    const task: Task = mission.task;
    setFeedback(null);
    if (mission.action === 'manage') {
      setCompletionCard({ title: task.title, dueLabel: null, points: mission.points });
      setPendingTarget({ id: task.id, householdId: household.id, title: task.title });
      return;
    }
    if (mission.action === 'claim') {
      setBusyId(task.id);
      try {
        const result = await claimOpenTask({ taskId: task.id, householdId: household.id, profileId: user.id, role });
        if (!result.ok) {
          setFeedback(result.reason === 'already_claimed' ? copy.activityCard.alreadyClaimed : copy.activityCard.claimError);
        }
      } catch {
        setFeedback(copy.activityCard.claimError);
      } finally {
        setBusyId(null);
      }
      return;
    }
    setCompletionCard({ title: task.title, dueLabel: mission.dueLabel, points: mission.points });
    setCompletionTarget({ id: task.id, householdId: household.id, title: task.title });
  }

  const { progress, hero, secondary, suggested, familyToday } = model;
  const subtitle = progress.total === 0
    ? copy.childHome.nothingDueToday
    : model.leftToday === 0
      ? copy.childHome.allDoneToday
      : model.leftToday === 1 ? copy.childHome.leftTodayOne : formatCopy(copy.childHome.leftToday, { n: model.leftToday });
  const progressA11y = formatCopy(copy.childHome.progressA11y, { done: progress.completed, total: progress.total });
  const children = (household?.members ?? []).filter((m) => m.role === 'child').slice(0, 4);

  return (
    <Screen style={styles.screen} edges={SCREEN_EDGES}>
      <ScrollView
        style={styles.ground}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}>

        {/* Player header */}
        <View style={[styles.band, { paddingTop: insets.top + sp.sm }]}>
          <View style={styles.avatarRing}>
            <FamilyAvatar name={name || '?'} avatarUrl={user?.avatarUrl} avatarEmoji={user?.avatarEmoji} size={compact ? 42 : 50} />
          </View>
          <View style={styles.flex}>
            {compact ? null : <Text style={[t('overline'), styles.onColorSoftText]}>{copy.childHome.eyebrow}</Text>}
            <Text style={[t('h2'), styles.onColorText]}>{formatCopy(copy.childHome.greeting, { name })}</Text>
            {compact && progress.total > 0 ? (
              <View accessible accessibilityLabel={progressA11y}>
                <Text style={[t('caption'), styles.onColorText]}>
                  {formatCopy(copy.childHome.compactProgress, { done: progress.completed, total: progress.total, left: model.leftToday })}
                </Text>
                <View style={{ marginTop: sp.xs }}><ProgressSegments done={progress.completed} total={progress.total} onBand thin /></View>
              </View>
            ) : (
              <Text style={[t('caption'), styles.onColorText]}>{subtitle}</Text>
            )}
          </View>
          <View
            style={styles.coin}
            accessible
            accessibilityRole="text"
            accessibilityLabel={formatCopy(copy.childHome.pointsA11y, { n: model.availablePoints })}>
            <View style={styles.coinFace}><Ionicons name="star" size={14} color={colors.goldDeep} /></View>
            <Text style={[t('h2'), styles.onGoldText]}>{model.availablePoints}</Text>
          </View>
        </View>

        <View style={[styles.body, compact && styles.bodyCompact]}>
          {/* Daily progress (standard / tall) */}
          {!compact && progress.total > 0 ? (
            <Card density="child" style={styles.progressCard}>
              <View accessible accessibilityLabel={progressA11y}>
                <View style={styles.row}>
                  <Text style={[t('title'), styles.inkText, styles.flex]}>{copy.childHome.todaysMissions}</Text>
                  <Text style={[t('caption'), styles.mutedText]}>{progress.completed} / {progress.total}</Text>
                </View>
                <View style={{ marginTop: sp.sm }}><ProgressSegments done={progress.completed} total={progress.total} /></View>
              </View>
            </Card>
          ) : null}

          {/* Hero */}
          <View accessibilityLabel={copy.childHome.nextMission}>
            <Hero hero={hero} name={name} busy={hero.kind === 'mission' && busyId === hero.mission.task.id} onAction={handleAction} />
          </View>

          {feedback ? <Banner tone="danger" text={feedback} /> : null}

          {/* Secondary missions: the child's own today and open-to-anyone,
              exactly the list their Home showed before */}
          {secondary.length > 0 ? (
            <View style={styles.stack}>
              {secondary.map((m) => (
                <SecondaryRow key={m.task.id} mission={m} busy={busyId === m.task.id} onAction={handleAction} />
              ))}
            </View>
          ) : null}

          {/* Suggested next reward: only one the child can't afford yet */}
          {suggested.kind === 'suggested' ? (
            <Card density="child" style={styles.rewardCard}>
              <View
                style={styles.row}
                accessible
                accessibilityLabel={`${copy.childHome.suggestedReward}: ${suggested.reward.title}. ${formatCopy(copy.childHome.pointsToGo, { n: suggested.pointsRemaining })}`}>
                <View style={styles.rewardBubble}>
                  <Ionicons name={ILLUSTRATION_PLACEHOLDER.reward} size={28} color={colors.goldDeep} />
                </View>
                <View style={styles.flex}>
                  {compact ? null : <Text style={[t('overline'), styles.mutedText]}>{copy.childHome.suggestedReward}</Text>}
                  <View style={[styles.row, styles.wrap]}>
                    <Text style={[t('title'), styles.inkText, styles.flex]}>{suggested.reward.title}</Text>
                    <Text style={[t('caption'), styles.mutedText]}>{formatCopy(copy.childHome.pointsToGo, { n: suggested.pointsRemaining })}</Text>
                  </View>
                  <View style={[styles.bar, { height: 10, backgroundColor: colors.childTrack, marginTop: sp.sm }]}>
                    <View style={[styles.barFill, { width: `${rewardRatio(model.availablePoints, suggested.reward.requiredPoints) * 100}%`, backgroundColor: colors.gold }]} />
                  </View>
                </View>
              </View>
            </Card>
          ) : null}

          {/* Family Today: counts only, no titles, Points or ranking */}
          {!compact && familyToday.total > 0 ? (
            <Card density="child" style={styles.familyCard}>
              <View accessible accessibilityLabel={formatCopy(copy.childHome.familyA11y, { done: familyToday.completed, total: familyToday.total })}>
                <View style={[styles.row, styles.wrap]}>
                  <View style={styles.avatarStack}>
                    {children.map((m, i) => (
                      <View key={m.id} style={[styles.stackedAvatar, i > 0 && { marginLeft: -8 }]}>
                        <FamilyAvatar name={m.name} avatarUrl={m.avatarUrl} avatarEmoji={m.avatarEmoji} size={24} />
                      </View>
                    ))}
                  </View>
                  <Text style={[t('title'), styles.inkText, styles.flex]}>{copy.childHome.familyToday}</Text>
                  <Text style={[t('caption'), styles.mutedText]}>
                    {formatCopy(copy.childHome.familyCount, { done: familyToday.completed, total: familyToday.total })}
                  </Text>
                </View>
                {familyToday.total <= MAX_FAMILY_DOTS ? (
                  <View style={[styles.dots, { marginTop: sp.sm }]}>
                    {Array.from({ length: familyToday.total }, (_, i) => (
                      <View key={i} style={[styles.dot, i < familyToday.completed && styles.dotDone]} />
                    ))}
                  </View>
                ) : (
                  <View style={[styles.bar, { height: 10, backgroundColor: colors.childTrack, marginTop: sp.sm }]}>
                    <View style={[styles.barFill, { width: `${progressRatio(familyToday) * 100}%`, backgroundColor: colors.success }]} />
                  </View>
                )}
              </View>
            </Card>
          ) : null}

          {/* Helpful claim: the existing form and rules, unchanged */}
          {canClaim && household && user ? (
            <ClaimContributionForm
              householdId={household.id}
              claimedByProfileId={user.id}
              role={role}
              myPendingTitle={myPendingClaimTitle}
            />
          ) : null}
        </View>
      </ScrollView>
      {/* The header band sits under the transparent status bar at rest. Once
          the page scrolls, this fixed strip in the band's own colour keeps
          content from passing beneath the status bar. Same colour as the
          band, so at rest it is invisible: no extra band, no double inset. */}
      {insets.top > 0 ? <View style={[styles.statusScrim, { height: insets.top }]} /> : null}

      <PendingCompletionModal
        task={pendingTarget}
        role={role}
        onReopenForPhoto={(task) => {
          setPendingTarget(null);
          setCompletionNotice(copy.completionSheet.resendNotice);
          setCompletionTarget(task);
        }}
        onClose={() => setPendingTarget(null)}
      />

      {/* Slice 5C.1: the same full-screen child Submit Evidence as Child
          Missions and Mission Details (one child evidence experience). */}
      <TaskCompletionModal
        variant="child"
        task={completionTarget}
        notice={completionNotice}
        missionCard={completionCard ? <EvidenceMissionCard {...completionCard} /> : undefined}
        onCompleted={(submission) => {
          if (submission) appSounds.play('completion_submitted', submission.id);
          setCompletionTarget(null);
          setCompletionNotice(null);
          requestHouseholdRefresh('mutation');
        }}
        onClose={() => {
          setCompletionTarget(null);
          setCompletionNotice(null);
        }}
      />
    </Screen>
  );
}

// The header band draws under the status bar itself (it pads by the inset).
const SCREEN_EDGES = ['left', 'right'] as const;

const styles = StyleSheet.create({
  screen:      { paddingHorizontal: 0, backgroundColor: colors.indigoTint },
  ground:      { backgroundColor: colors.indigoTint },
  content:     { paddingBottom: sp.xxl, flexGrow: 1 },
  flex:        { flex: 1, minWidth: 0 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
  evidenceCard: { padding: sp.md },
  wrap:        { flexWrap: 'wrap' },
  center:      { textAlign: 'center' },
  stack:       { gap: sp.sm },
  pressed:     { opacity: 0.85 },

  inkText:          { color: colors.ink },
  mutedText:        { color: colors.textSecondary },
  onColorText:      { color: colors.textOnColor },
  onColorSoftText:  { color: colors.textOnColor, opacity: 0.9 },
  onGoldText:       { color: colors.onGold },
  indigoDeepText:   { color: colors.indigoDeep },
  waitingText:      { color: colors.waiting },

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
  avatarRing: {
    borderRadius:    radius.pill,
    borderWidth:     3,
    borderColor:     colors.textOnColor,
    backgroundColor: colors.indigoTint,
  },
  coin: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               sp.sm,
    minHeight:         40,
    paddingLeft:       sp.sm,
    paddingRight:      sp.md,
    borderRadius:      radius.pill,
    backgroundColor:   colors.gold,
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

  body:        { paddingHorizontal: sp.lg, paddingTop: sp.lg, gap: sp.md },
  bodyCompact: { paddingTop: sp.md, gap: sp.sm },

  progressCard: { paddingVertical: sp.md, paddingHorizontal: sp.md },
  segments:     { flexDirection: 'row', gap: 6 },
  segment:      { flex: 1, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentDone:  { backgroundColor: colors.success },
  bar:          { borderRadius: radius.pill, overflow: 'hidden' },
  barFill:      { height: '100%', borderRadius: radius.pill },

  hero: {
    backgroundColor: colors.childHero,
    borderRadius:    radius.childCard + 2,
    padding:         sp.md,
    gap:             sp.sm + 2,
    ...depth.childButton,
  },
  stateHero:   { alignItems: 'center', paddingVertical: sp.xxl },
  ribbon: {
    backgroundColor:   colors.success,
    borderRadius:      sp.sm,
    paddingHorizontal: sp.sm + 2,
    paddingVertical:   sp.xs,
  },
  ribbonSentBack: { backgroundColor: colors.indigoTint },
  // Overdue: the semantic warning amber (white text ≈ 5:1), never the
  // success green of a ready mission.
  ribbonOverdue:  { backgroundColor: colors.warning },
  pointsPill: {
    minHeight:         28,
    paddingHorizontal: sp.sm + 2,
    borderRadius:      radius.pill,
    backgroundColor:   colors.gold,
    justifyContent:    'center',
  },
  art: {
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },
  // Board 02 mission-row stage: an indigo-tinted tile on the white card.
  artOnCard: { backgroundColor: colors.indigoTint },

  stateCard:   { alignItems: 'center', gap: sp.sm, paddingVertical: sp.xxl },
  stateBubble: {
    width:           96,
    height:          96,
    borderRadius:    48,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },

  mini:        { padding: sp.sm, gap: sp.sm, minHeight: 60 },
  go: {
    width:           sizes.tapTarget,
    height:          sizes.tapTarget,
    borderRadius:    radius.control,
    backgroundColor: colors.indigoTint,
    alignItems:      'center',
    justifyContent:  'center',
  },
  waitingRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               sp.sm + 2,
    minHeight:         sizes.tapTarget,
    paddingHorizontal: sp.md,
    paddingVertical:   sp.sm + 2,
    borderRadius:      radius.control,
    backgroundColor:   colors.waitingSoft,
  },

  rewardCard:   { paddingVertical: sp.sm + 2, paddingHorizontal: sp.md },
  rewardBubble: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: colors.waitingSoft,
    borderWidth:     2,
    borderColor:     colors.gold,
    alignItems:      'center',
    justifyContent:  'center',
  },

  familyCard:    { paddingVertical: sp.sm + 2, paddingHorizontal: sp.md },
  avatarStack:   { flexDirection: 'row' },
  stackedAvatar: { borderRadius: radius.pill, borderWidth: 2, borderColor: colors.surface },
  dots:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot:           { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.indigoTint },
  dotDone:       { backgroundColor: colors.success },
});

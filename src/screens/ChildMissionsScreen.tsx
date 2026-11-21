import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { resolveViewerTimeZone } from '@/domain/localDay';
import {
  buildChildMissionsModel,
  defaultMissionsSection,
  MISSIONS_SECTIONS,
  type DoneMission,
  type FirstMission,
  type MissionsSection,
  type TodoMission,
  type WaitingMission,
} from '@/features/childMissions/childMissionsModel';
import { computeMyPointsSummary, selectReservedPendingSnapshots } from '@/features/rewards/pointsSummary';
import { appSounds } from '@/features/sounds/appSounds';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
import { claimOpenTask } from '@/features/tasks/claimOpenTask';
import { PendingCompletionModal, type PendingCompletionModalTask } from '@/features/tasks/components/PendingCompletionModal';
import { TaskCompletionModal, type TaskCompletionModalTask } from '@/features/tasks/components/TaskCompletionModal';
import { EvidenceMissionCard, MissionArt, PointsPill, useT } from '@/screens/ChildHomeScreen';
import {
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectMyPointsBalance,
  selectRewardRedemptions,
  selectTasks,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, depth, lockedSpacing as sp, radius, sizes } from '@/theme';
import type { Task } from '@/types';

// Slice 5B: Child Missions (Board 03 "Child Missions Final", Board 14
// tokens). The child's Missions tab.
//   - Every list comes from buildChildMissionsModel. This screen only
//     renders, in three sections: To Do, Waiting, Done.
//   - Every action reuses the existing flow:
//       - TaskCompletionModal: "I did it!" and "Try again" (request with photos)
//       - claimOpenTask: "I'll do this"
//       - PendingCompletionModal: "Change photos" on a Waiting card. Cancel
//         completion stays inside that sheet, never on the card.
//   - Sent back is indigo and encouraging, Waiting is calm amber, Done is
//     quiet success. Gold only marks Points. No celebration replays here.
//   - Illustrations use the Child Home placeholder (MissionArt).
//   - Slice 5C: tapping a mission (not its button) opens Mission Details
//     through onOpenMission, which the shell passes in. The screen itself
//     never navigates. Buttons keep their direct action. The child Submit
//     Evidence screen is TaskCompletionModal's 'child' variant.
// The adult "My Tasks" view keeps MyTasksScreen, unchanged.

const SECTION_LABEL: Record<MissionsSection, string> = {
  todo:    copy.childMissions.sectionTodo,
  waiting: copy.childMissions.sectionWaiting,
  done:    copy.childMissions.sectionDone,
};

const FIRST_RIBBON: Record<string, string> = {
  sent_back:      copy.childHome.ribbonSentBack,
  open_to_anyone: copy.childHome.ribbonOpen,
  overdue:        copy.childHome.ribbonOverdue,
};

const CTA_LABEL = {
  complete: copy.childHome.ctaComplete,
  retry:    copy.childHome.ctaRetry,
  claim:    copy.childHome.ctaClaim,
  manage:   copy.childMissions.changePhotos,
} as const;

// Icon + word for every state, so colour is never the only signal.
function StateLine({ mission }: { mission: TodoMission }) {
  const t = useT();
  if (mission.state === 'sent_back') {
    return (
      <View style={styles.stateLine}>
        <Ionicons name="refresh" size={16} color={colors.indigoDeep} />
        <Text style={[t('caption'), styles.indigoDeepText, styles.flex]}>{copy.childMissions.giveItAnotherGo}</Text>
      </View>
    );
  }
  if (mission.state === 'overdue') {
    return (
      <View style={styles.stateLine}>
        <Ionicons name="alarm-outline" size={16} color={colors.warning} />
        <Text style={[t('caption'), styles.warningText, styles.flex]}>
          {mission.dueLabel ? `${copy.childMissions.overdue} · ${mission.dueLabel}` : copy.childMissions.overdue}
        </Text>
      </View>
    );
  }
  if (mission.state === 'open_to_anyone') {
    return (
      <View style={styles.stateLine}>
        <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
        <Text style={[t('caption'), styles.mutedText, styles.flex]}>{copy.childMissions.openToAnyone}</Text>
      </View>
    );
  }
  return mission.dueLabel ? <Text style={[t('caption'), styles.mutedText]}>{mission.dueLabel}</Text> : null;
}

// The tappable part of a mission card: opens Mission Details. Buttons on
// the card sit outside it, so they keep their own direct action.
function OpenArea({ title, onOpen, children }: { title: string; onOpen?: () => void; children: React.ReactNode }) {
  if (!onOpen) return <View style={[styles.row, { gap: sp.sm + 2 }]}>{children}</View>;
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.row, styles.openArea, { gap: sp.sm + 2 }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={formatCopy(copy.childMissions.openMissionA11y, { title })}>
      {children}
    </Pressable>
  );
}

function SectionTabs({ active, counts, onSelect }: {
  active: MissionsSection;
  counts: { todo: number; waiting: number; done: number };
  onSelect: (s: MissionsSection) => void;
}) {
  const t = useT();
  return (
    <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel={copy.childMissions.sectionsA11y}>
      {MISSIONS_SECTIONS.map((section) => {
        const on = section === active;
        const showCount = section !== 'done' && counts[section] > 0;
        return (
          <Pressable
            key={section}
            onPress={() => onSelect(section)}
            style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && !on && styles.pressed]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            accessibilityLabel={showCount ? formatCopy(copy.childMissions.sectionTabA11y, { label: SECTION_LABEL[section], n: counts[section] }) : SECTION_LABEL[section]}>
            <Text style={[t('title'), on ? styles.onColorText : styles.inkText, styles.center]}>{SECTION_LABEL[section]}</Text>
            {showCount ? (
              <View style={[styles.tabCount, on && styles.tabCountOn]}>
                <Text style={[t('caption'), on ? styles.indigoDeepText : styles.mutedText]}>{counts[section]}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function FirstMissionCard({ mission, busy, onAction, onOpen }: { mission: FirstMission; busy: boolean; onAction: (m: TodoMission) => void; onOpen?: () => void }) {
  const t = useT();
  const tone = mission.ribbonTone;
  return (
    <View style={styles.first}>
      <View style={styles.row}>
        <Text style={[t('overline'), styles.indigoText, styles.flex]}>{copy.childMissions.doThisFirst}</Text>
        <View style={[styles.ribbon, tone === 'indigo' && styles.ribbonSentBack, tone === 'warning' && styles.ribbonOverdue]}>
          <Text style={[t('overline'), tone === 'indigo' ? styles.indigoDeepText : styles.onColorText]}>
            {FIRST_RIBBON[mission.reason] ?? copy.childHome.ribbonReady}
          </Text>
        </View>
      </View>
      <OpenArea title={mission.task.title} onOpen={onOpen}>
        <MissionArt kind="mission" size={64} glyph={34} onCard />
        <View style={styles.flex}>
          <Text style={[t('h2'), styles.inkText]}>{mission.task.title}</Text>
          {mission.state === 'ready' && mission.dueLabel ? <Text style={[t('caption'), styles.mutedText]}>{mission.dueLabel}</Text> : null}
          {mission.state !== 'ready' ? <StateLine mission={mission} /> : null}
        </View>
        {mission.points ? <PointsPill points={mission.points} short /> : null}
      </OpenArea>
      <AppButton
        label={CTA_LABEL[mission.action]}
        variant={mission.action === 'claim' ? 'secondary' : 'primary'}
        density="child"
        busy={busy}
        onPress={() => onAction(mission)}
      />
    </View>
  );
}

function TodoRow({ mission, busy, onAction, onOpen }: { mission: TodoMission; busy: boolean; onAction: (m: TodoMission) => void; onOpen?: () => void }) {
  const t = useT();
  const body = (
    <>
      <MissionArt kind="mission" size={44} glyph={24} onCard />
      <View style={styles.flex}>
        <Text style={[t('title'), styles.inkText]}>{mission.task.title}</Text>
        <StateLine mission={mission} />
      </View>
      {mission.points ? <PointsPill points={mission.points} short /> : null}
    </>
  );
  // Sent back and open-to-anyone carry their own visible button (Board 03).
  if (mission.action === 'retry' || mission.action === 'claim') {
    return (
      <Card density="child" style={styles.mini}>
        <OpenArea title={mission.task.title} onOpen={onOpen}>{body}</OpenArea>
        <AppButton
          label={CTA_LABEL[mission.action]}
          variant={mission.action === 'retry' ? 'primary' : 'secondary'}
          icon={mission.action === 'retry' ? 'refresh' : undefined}
          density="child"
          busy={busy}
          onPress={() => onAction(mission)}
        />
      </Card>
    );
  }
  // A ready row is one tap target with a chevron: it opens Mission Details
  // (where "I did it!" is pinned), or the completion flow without a shell.
  return (
    <Pressable
      onPress={onOpen ?? (() => onAction(mission))}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={onOpen
        ? formatCopy(copy.childMissions.openMissionA11y, { title: `${mission.task.title}${mission.state === 'overdue' ? `, ${copy.childMissions.overdue}` : ''}` })
        : `${mission.task.title}. ${mission.state === 'overdue' ? `${copy.childMissions.overdue}. ` : ''}${copy.childHome.ctaComplete}`}
      accessibilityHint={onOpen ? undefined : copy.childHome.openMissionHint}>
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

function photosLabel(m: WaitingMission): string | null {
  if (m.photoCount === null) return null;
  if (m.photoCount === 0) return copy.childMissions.noPhotosSent;
  return m.photoCount === 1 ? copy.childMissions.photosSentOne : formatCopy(copy.childMissions.photosSent, { n: m.photoCount });
}

function WaitingCard({ mission, onChangePhotos, onOpen }: { mission: WaitingMission; onChangePhotos: (m: WaitingMission) => void; onOpen?: () => void }) {
  const t = useT();
  const photos = photosLabel(mission);
  return (
    <Card density="child" style={styles.mini}>
      <OpenArea title={mission.task.title} onOpen={onOpen}>
        <MissionArt kind="mission" size={52} glyph={28} onCard />
        <View style={styles.flex}>
          <Text style={[t('title'), styles.inkText]}>{mission.task.title}</Text>
          <View style={styles.stateLine}>
            <Ionicons name="time-outline" size={16} color={colors.waiting} />
            <Text style={[t('caption'), styles.waitingText, styles.flex]}>
              {photos ? `${copy.childMissions.waitingTitle} · ${photos}` : copy.childMissions.waitingTitle}
            </Text>
          </View>
        </View>
        {mission.points ? <PointsPill points={mission.points} short /> : null}
      </OpenArea>
      {/* Board 03: the only action on a Waiting card. Cancel completion is
          inside the pending sheet this opens, never on the card. */}
      <AppButton
        label={copy.childMissions.changePhotos}
        variant="secondary"
        icon="images-outline"
        density="child"
        accessibilityHint={copy.childMissions.changePhotosHint}
        onPress={() => onChangePhotos(mission)}
      />
    </Card>
  );
}

function DoneRow({ mission, onOpen }: { mission: DoneMission; onOpen?: () => void }) {
  const t = useT();
  const a11y = mission.points
    ? formatCopy(copy.childMissions.doneRowPointsA11y, { title: mission.task.title, n: mission.points })
    : formatCopy(copy.childMissions.doneRowA11y, { title: mission.task.title });
  return (
    <Card density="child" style={[styles.mini, styles.doneCard]}>
      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        style={({ pressed }) => [styles.row, styles.openArea, { gap: sp.sm + 2 }, pressed && styles.pressed]}
        accessibilityRole={onOpen ? 'button' : 'text'}
        accessibilityLabel={a11y}>
        <View style={styles.doneTile}><Ionicons name="checkmark" size={24} color={colors.success} /></View>
        <View style={styles.flex}>
          <Text style={[t('title'), styles.mutedText]}>{mission.task.title}</Text>
          <Text style={[t('caption'), styles.successText]}>{copy.childMissions.sectionDone}</Text>
        </View>
        {mission.points ? (
          <View style={styles.donePill}>
            <Ionicons name="checkmark" size={14} color={colors.success} />
            <Text style={[t('caption'), styles.successText]}>{formatCopy(copy.childHome.pointsPillShort, { n: mission.points })}</Text>
          </View>
        ) : null}
      </Pressable>
    </Card>
  );
}

function EmptySection({ title, body, icon }: { title: string; body: string; icon: keyof typeof Ionicons.glyphMap }) {
  const t = useT();
  return (
    <Card density="child" style={styles.emptyCard}>
      <View style={styles.emptyBubble}><Ionicons name={icon} size={32} color={colors.childHero} /></View>
      <Text style={[t('h2'), styles.inkText, styles.center]}>{title}</Text>
      <Text style={[t('caption'), styles.mutedText, styles.center]}>{body}</Text>
    </Card>
  );
}

type CompletionMission = { title: string; dueLabel: string | null; points: number | null };

export function ChildMissionsScreen({ onOpenMission }: { onOpenMission?: (taskId: string) => void } = {}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const refreshControl = useHouseholdRefreshControl();

  const tasks           = useAppStore(selectTasks);
  const taskSubmissions = useAppStore((s) => s.taskSubmissions);
  const redemptions     = useAppStore(selectRewardRedemptions);
  const myBalance       = useAppStore(selectMyPointsBalance);
  const household       = useAppStore(selectCurrentHousehold);
  const user            = useAppStore(selectCurrentUser);
  const role            = useAppStore(selectCurrentMemberRole);
  const childId         = user?.id ?? '';

  const nowKey = Math.floor(Date.now() / 60_000);
  const model = useMemo(
    () => buildChildMissionsModel({
      tasks, taskSubmissions, childId,
      now:      new Date(nowKey * 60_000),
      timeZone: resolveViewerTimeZone(),
    }),
    [tasks, taskSubmissions, childId, nowKey],
  );
  // Available Points: the Rewards semantics, as on the Child Home coin.
  const availablePoints = useMemo(
    () => computeMyPointsSummary(myBalance?.balance ?? 0, selectReservedPendingSnapshots(redemptions, childId)).available,
    [myBalance, redemptions, childId],
  );

  const [chosen, setChosen]                     = useState<MissionsSection | null>(null);
  const section = chosen ?? defaultMissionsSection(model);
  const [busyId, setBusyId]                     = useState<string | null>(null);
  const [feedback, setFeedback]                 = useState<string | null>(null);
  const [completionTarget, setCompletionTarget] = useState<TaskCompletionModalTask | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [completionCard, setCompletionCard]     = useState<CompletionMission | null>(null);
  const [pendingTarget, setPendingTarget]       = useState<PendingCompletionModalTask | null>(null);

  // The same branches as the Child Home (and the child's old My Tasks).
  async function handleAction(mission: TodoMission) {
    if (busyId || !household || !user) return;
    const task: Task = mission.task;
    setFeedback(null);
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

  const openFor = (taskId: string) => (onOpenMission ? () => onOpenMission(taskId) : undefined);

  function openPending(mission: WaitingMission) {
    if (!household) return;
    setFeedback(null);
    setCompletionCard({ title: mission.task.title, dueLabel: null, points: mission.points });
    setPendingTarget({ id: mission.task.id, householdId: household.id, title: mission.task.title });
  }

  const { first, todo, waiting, doneToday, doneEarlier, counts } = model;

  return (
    <Screen style={styles.screen} edges={SCREEN_EDGES}>
      <ScrollView
        style={styles.ground}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}>

        <View style={[styles.band, { paddingTop: insets.top + sp.sm }]}>
          <Text style={[t('h1'), styles.onColorText, styles.flex]} accessibilityRole="header">{copy.childMissions.title}</Text>
          <View
            style={styles.coin}
            accessible
            accessibilityRole="text"
            accessibilityLabel={formatCopy(copy.childHome.pointsA11y, { n: availablePoints })}>
            <View style={styles.coinFace}><Ionicons name="star" size={14} color={colors.goldDeep} /></View>
            <Text style={[t('h2'), styles.onGoldText]}>{availablePoints}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <SectionTabs active={section} counts={counts} onSelect={setChosen} />

          {feedback ? <Banner tone="danger" text={feedback} /> : null}

          {section === 'todo' ? (
            counts.todo === 0 ? (
              <EmptySection title={copy.childMissions.todoEmptyTitle} body={copy.childMissions.todoEmptyBody} icon="flag-outline" />
            ) : (
              <View style={styles.stack}>
                {first ? <FirstMissionCard mission={first} busy={busyId === first.task.id} onAction={handleAction} onOpen={openFor(first.task.id)} /> : null}
                {todo.map((m) => <TodoRow key={m.task.id} mission={m} busy={busyId === m.task.id} onAction={handleAction} onOpen={openFor(m.task.id)} />)}
              </View>
            )
          ) : null}

          {section === 'waiting' ? (
            counts.waiting === 0 ? (
              <EmptySection title={copy.childMissions.waitingEmptyTitle} body={copy.childMissions.waitingEmptyBody} icon="time-outline" />
            ) : (
              <View style={styles.stack}>
                <View style={styles.waitingBanner}>
                  <View style={styles.waitingBubble}><Ionicons name="time-outline" size={22} color={colors.waiting} /></View>
                  <View style={styles.flex}>
                    <Text style={[t('title'), styles.inkText]}>{copy.childMissions.waitingTitle}</Text>
                    <Text style={[t('caption'), styles.waitingText]}>{copy.childMissions.waitingBody}</Text>
                  </View>
                </View>
                {waiting.map((m) => <WaitingCard key={m.task.id} mission={m} onChangePhotos={openPending} onOpen={openFor(m.task.id)} />)}
                <View style={styles.note}>
                  <Ionicons name="time-outline" size={16} color={colors.waiting} />
                  <Text style={[t('caption'), styles.waitingText, styles.flex]}>{copy.childMissions.waitingNote}</Text>
                </View>
              </View>
            )
          ) : null}

          {section === 'done' ? (
            counts.done === 0 ? (
              <EmptySection title={copy.childMissions.doneEmptyTitle} body={copy.childMissions.doneEmptyBody} icon="checkmark-circle-outline" />
            ) : (
              <View style={styles.stack}>
                {doneToday.length > 0 ? (
                  <Text style={[t('overline'), styles.mutedText]} accessibilityRole="header">
                    {formatCopy(copy.childMissions.doneToday, { n: doneToday.length })}
                  </Text>
                ) : null}
                {doneToday.map((m) => <DoneRow key={m.task.id} mission={m} onOpen={openFor(m.task.id)} />)}
                {doneEarlier.length > 0 ? (
                  <View style={styles.divider}>
                    <Text style={[t('overline'), styles.mutedText]} accessibilityRole="header">{copy.childMissions.doneEarlier}</Text>
                    <View style={styles.dividerLine} />
                  </View>
                ) : null}
                {doneEarlier.map((m) => <DoneRow key={m.task.id} mission={m} onOpen={openFor(m.task.id)} />)}
              </View>
            )
          ) : null}
        </View>
      </ScrollView>
      {/* Same status-bar strip as the Child Home (vc14): scrolled content
          never passes beneath the transparent status bar. */}
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

const SCREEN_EDGES = ['left', 'right'] as const;

const styles = StyleSheet.create({
  screen:  { paddingHorizontal: 0, backgroundColor: colors.indigoTint },
  ground:  { backgroundColor: colors.indigoTint },
  content: { paddingBottom: sp.xxl, flexGrow: 1 },
  flex:    { flex: 1, minWidth: 0 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
  center:  { textAlign: 'center' },
  stack:   { gap: sp.sm + 2 },
  pressed: { opacity: 0.85 },
  // Mission Details tap area: a 48dp target even on a one-line row.
  openArea: { minHeight: sizes.tapTarget, borderRadius: radius.control },

  inkText:        { color: colors.ink },
  mutedText:      { color: colors.textSecondary },
  onColorText:    { color: colors.textOnColor },
  onGoldText:     { color: colors.onGold },
  indigoText:     { color: colors.indigo },
  indigoDeepText: { color: colors.indigoDeep },
  warningText:    { color: colors.warning },
  waitingText:    { color: colors.waiting },
  successText:    { color: colors.success },

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

  body: { paddingHorizontal: sp.lg, paddingTop: sp.lg, gap: sp.md },

  // To Do / Waiting / Done. Each tab is a 48dp target; the label wraps
  // with its count under a large font instead of clipping.
  tabs: {
    flexDirection:   'row',
    gap:             sp.xs,
    padding:         sp.xs,
    borderRadius:    radius.control + 4,
    backgroundColor: colors.surface,
  },
  tab: {
    flex:              1,
    minWidth:          0,
    minHeight:         sizes.tapTarget,
    flexDirection:     'row',
    flexWrap:          'wrap',
    alignItems:        'center',
    alignContent:      'center',
    justifyContent:    'center',
    gap:               sp.xs,
    paddingHorizontal: sp.xs,
    paddingVertical:   sp.xs,
    borderRadius:      radius.control,
  },
  tabOn:      { backgroundColor: colors.indigo },
  tabCount: {
    minWidth:          22,
    paddingHorizontal: 6,
    borderRadius:      radius.pill,
    backgroundColor:   colors.indigoTint,
    alignItems:        'center',
  },
  tabCountOn: { backgroundColor: colors.surface },

  // Board 03 "Do this first": white card with an indigo ring and depth.
  first: {
    backgroundColor: colors.surface,
    borderRadius:    radius.childCard + 2,
    borderWidth:     3,
    borderColor:     colors.indigo,
    padding:         sp.md,
    gap:             sp.sm + 2,
    ...depth.childButton,
  },
  ribbon: {
    backgroundColor:   colors.success,
    borderRadius:      sp.sm,
    paddingHorizontal: sp.sm + 2,
    paddingVertical:   sp.xs,
  },
  ribbonSentBack: { backgroundColor: colors.indigoTint },
  ribbonOverdue:  { backgroundColor: colors.warning },

  stateLine: { flexDirection: 'row', alignItems: 'center', gap: sp.xs },

  mini: { padding: sp.sm, gap: sp.sm, minHeight: 60 },
  go: {
    width:           sizes.tapTarget,
    height:          sizes.tapTarget,
    borderRadius:    radius.control,
    backgroundColor: colors.indigoTint,
    alignItems:      'center',
    justifyContent:  'center',
  },

  waitingBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             sp.md,
    padding:         sp.md,
    borderRadius:    radius.childCard,
    backgroundColor: colors.waitingSoft,
  },
  waitingBubble: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: sp.sm, paddingHorizontal: sp.xs },

  doneCard: { backgroundColor: colors.surface },
  doneTile: {
    width:           44,
    height:          44,
    borderRadius:    11,
    backgroundColor: colors.successSoft,
    alignItems:      'center',
    justifyContent:  'center',
  },
  donePill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               2,
    minHeight:         28,
    paddingHorizontal: sp.sm,
    borderRadius:      radius.pill,
    backgroundColor:   colors.successSoft,
  },
  divider:     { flexDirection: 'row', alignItems: 'center', gap: sp.sm, marginTop: sp.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },

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

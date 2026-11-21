import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { resolveViewerTimeZone } from '@/domain/localDay';
import { buildMissionDetailsModel, type MissionDetails, type MissionDetailsState } from '@/features/childMissions/missionDetailsModel';
import { appSounds } from '@/features/sounds/appSounds';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import { claimOpenTask } from '@/features/tasks/claimOpenTask';
import { PendingCompletionModal, type PendingCompletionModalTask } from '@/features/tasks/components/PendingCompletionModal';
import { TaskCompletionModal, type TaskCompletionModalTask } from '@/features/tasks/components/TaskCompletionModal';
import { EvidenceMissionCard, MissionArt, PointsPill, useT } from '@/screens/ChildHomeScreen';
import { selectCurrentHousehold, selectCurrentMemberRole, selectCurrentUser, selectTasks } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, lockedSpacing as sp, radius, sizes } from '@/theme';

// Slice 5C: Child Mission Details (Board 19). A full-screen route on the
// root stack above the child tabs, so the tab bar is not shown here; the
// pinned action takes its place.
//   - The route passes only a task id. The task, its submission and the
//     members are read from the store on every render
//     (buildMissionDetailsModel), so the state is always current.
//   - Real fields only: title, description, due, asked by, Points, state.
//   - Every action reuses the existing flow:
//       - TaskCompletionModal (child Submit Evidence): "I did it!" / "Try again"
//       - claimOpenTask: "I'll do this"
//       - PendingCompletionModal: "Change photos"; Cancel completion stays
//         inside that sheet (Board 21).
//   - Sent back is indigo and encouraging, Waiting calm amber, Done quiet
//     success. Gold only marks Points. No celebration replay.
//   - The screen never navigates by itself: the shell passes onBack.

type Props = {
  taskId: string;
  onBack: () => void;
};

const STATE_LABEL: Record<MissionDetailsState, string> = {
  ready:          copy.missionDetails.stateReady,
  overdue:        copy.missionDetails.stateOverdue,
  sent_back:      copy.childMissions.giveItAnotherGo,
  open_to_anyone: copy.childMissions.openToAnyone,
  waiting:        copy.missionDetails.stateWaiting,
  done:           copy.missionDetails.stateDone,
};

const STATE_ICON: Record<MissionDetailsState, keyof typeof Ionicons.glyphMap> = {
  ready:          'flag-outline',
  overdue:        'alarm-outline',
  sent_back:      'refresh',
  open_to_anyone: 'people-outline',
  waiting:        'time-outline',
  done:           'checkmark',
};

const CTA_LABEL = {
  complete: copy.childHome.ctaComplete,
  retry:    copy.childHome.ctaRetry,
  claim:    copy.childHome.ctaClaim,
  manage:   copy.childMissions.changePhotos,
} as const;

function photosLabel(n: number | null): string | null {
  if (n === null) return null;
  if (n === 0) return copy.childMissions.noPhotosSent;
  return n === 1 ? copy.childMissions.photosSentOne : formatCopy(copy.childMissions.photosSent, { n });
}

function StatePill({ state }: { state: MissionDetailsState }) {
  const t = useT();
  const tone = state === 'waiting' || state === 'overdue' ? 'amber' : state === 'done' ? 'success' : 'indigo';
  const fg = tone === 'amber' ? (state === 'overdue' ? colors.warning : colors.waiting) : tone === 'success' ? colors.success : colors.indigoDeep;
  return (
    <View style={[styles.pill, tone === 'amber' && styles.pillAmber, tone === 'success' && styles.pillSuccess]}>
      <Ionicons name={STATE_ICON[state]} size={16} color={fg} />
      <Text style={[t('caption'), { color: fg }]}>{STATE_LABEL[state]}</Text>
    </View>
  );
}

function FactRow({ icon, label, children }: { icon: keyof typeof Ionicons.glyphMap; label: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={20} color={colors.indigo} />
      <Text style={[t('title'), styles.mutedText, styles.factLabel]}>{label}</Text>
      <View style={styles.factValue}>{children}</View>
    </View>
  );
}

function StateBanner({ mission }: { mission: MissionDetails }) {
  const t = useT();
  if (mission.state === 'waiting') {
    const photos = photosLabel(mission.photoCount);
    const text = photos && mission.sentLabel
      ? formatCopy(copy.missionDetails.photosSentAt, { photos, time: mission.sentLabel })
      : photos ?? copy.childMissions.waitingBody;
    return (
      <View style={[styles.banner, styles.bannerAmber]}>
        <Ionicons name="camera-outline" size={20} color={colors.waiting} />
        <Text style={[t('title'), styles.waitingText, styles.flex]}>{text}</Text>
      </View>
    );
  }
  if (mission.state === 'sent_back') {
    return (
      <View style={[styles.banner, styles.bannerIndigo]}>
        <Ionicons name="refresh" size={20} color={colors.indigoDeep} />
        <Text style={[t('title'), styles.indigoDeepText, styles.flex]}>{copy.missionDetails.sentBackBanner}</Text>
      </View>
    );
  }
  if (mission.state === 'done') {
    return (
      <View style={[styles.banner, styles.bannerSuccess]}>
        <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
        <Text style={[t('title'), styles.successText, styles.flex]}>{copy.missionDetails.doneBanner}</Text>
      </View>
    );
  }
  return null;
}

export function ChildMissionDetailsScreen({ taskId, onBack }: Props) {
  const t = useT();
  const tasks           = useAppStore(selectTasks);
  const taskSubmissions = useAppStore((s) => s.taskSubmissions);
  const household       = useAppStore(selectCurrentHousehold);
  const user            = useAppStore(selectCurrentUser);
  const role            = useAppStore(selectCurrentMemberRole);
  const childId         = user?.id ?? '';

  const nowKey = Math.floor(Date.now() / 60_000);
  const model = useMemo(
    () => buildMissionDetailsModel({
      taskId, tasks, taskSubmissions, childId,
      members:  household?.members ?? [],
      now:      new Date(nowKey * 60_000),
      timeZone: resolveViewerTimeZone(),
    }),
    [taskId, tasks, taskSubmissions, childId, household, nowKey],
  );

  const [busy, setBusy]                         = useState(false);
  const [feedback, setFeedback]                 = useState<string | null>(null);
  const [completionTarget, setCompletionTarget] = useState<TaskCompletionModalTask | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget]       = useState<PendingCompletionModalTask | null>(null);

  const mission = model.kind === 'mission' ? model : null;

  async function handleAction() {
    if (!mission || !mission.action || busy || !household || !user) return;
    const task = mission.task;
    setFeedback(null);
    if (mission.action === 'claim') {
      setBusy(true);
      try {
        const result = await claimOpenTask({ taskId: task.id, householdId: household.id, profileId: user.id, role });
        if (!result.ok) {
          setFeedback(result.reason === 'already_claimed' ? copy.activityCard.alreadyClaimed : copy.activityCard.claimError);
        }
      } catch {
        setFeedback(copy.activityCard.claimError);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mission.action === 'manage') {
      setPendingTarget({ id: task.id, householdId: household.id, title: task.title });
      return;
    }
    setCompletionTarget({ id: task.id, householdId: household.id, title: task.title });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={copy.missionDetails.back}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={[t('h2'), styles.inkText, styles.flex]} accessibilityRole="header">{copy.missionDetails.title}</Text>
      </View>

      <ScrollView style={styles.flexFill} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {mission ? (
          <>
            <Card density="child" style={styles.hero}>
              <MissionArt kind="mission" size={88} glyph={48} onCard />
              <Text style={[t('display'), styles.inkText, styles.center]} accessibilityRole="header">{mission.title}</Text>
              <StatePill state={mission.state} />
            </Card>

            <StateBanner mission={mission} />
            {feedback ? <Banner tone="danger" text={feedback} /> : null}

            {mission.description ? (
              <Card density="child" style={styles.card}>
                <Text style={[t('overline'), styles.mutedText]}>{copy.missionDetails.whatToDo}</Text>
                <Text style={[t('title'), styles.inkText]}>{mission.description}</Text>
              </Card>
            ) : null}

            {mission.dueLabel || mission.askedBy || mission.points ? (
              <Card density="child" style={styles.facts}>
                {mission.dueLabel ? (
                  <FactRow icon="time-outline" label={copy.missionDetails.due}>
                    <Text style={[t('title'), mission.state === 'overdue' ? styles.warningText : styles.inkText, styles.valueText]}>{mission.dueLabel}</Text>
                  </FactRow>
                ) : null}
                {mission.askedBy ? (
                  <FactRow icon="person-outline" label={copy.missionDetails.askedBy}>
                    <Text style={[t('title'), styles.inkText, styles.valueText]}>{mission.askedBy}</Text>
                  </FactRow>
                ) : null}
                {mission.points ? (
                  <FactRow icon="gift-outline" label={copy.missionDetails.points}>
                    <PointsPill points={mission.points} short />
                  </FactRow>
                ) : null}
              </Card>
            ) : null}
          </>
        ) : (
          <Card density="child" style={styles.hero}>
            <View style={styles.missingBubble}><Ionicons name="flag-outline" size={32} color={colors.childHero} /></View>
            <Text style={[t('h2'), styles.inkText, styles.center]} accessibilityRole="header">{copy.missionDetails.missingTitle}</Text>
            <Text style={[t('caption'), styles.mutedText, styles.center]}>{copy.missionDetails.missingBody}</Text>
          </Card>
        )}
      </ScrollView>

      {/* Pinned action: the full-screen detail's replacement for the tab
          bar. Done has nothing to do, so no bar. */}
      {mission && mission.action ? (
        <View style={styles.bar}>
          <AppButton
            label={CTA_LABEL[mission.action]}
            variant="primary"
            icon={mission.action === 'retry' ? 'refresh' : mission.action === 'manage' ? 'images-outline' : undefined}
            density="child"
            busy={busy}
            accessibilityHint={mission.action === 'manage' ? copy.childMissions.changePhotosHint : undefined}
            onPress={() => { void handleAction(); }}
          />
          {mission.action === 'manage' ? (
            <Text style={[t('caption'), styles.waitingText, styles.center]}>{copy.childMissions.waitingNote}</Text>
          ) : null}
        </View>
      ) : !mission ? (
        <View style={styles.bar}>
          <AppButton label={copy.childEvidence.backToMissions} variant="secondary" density="child" onPress={onBack} />
        </View>
      ) : null}

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
        missionCard={mission ? <EvidenceMissionCard title={mission.title} dueLabel={mission.dueLabel} points={mission.points} /> : undefined}
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
        onSentDone={onBack}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: colors.indigoTint },
  flex:     { flex: 1, minWidth: 0 },
  flexFill: { flex: 1 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
  center:   { textAlign: 'center' },
  pressed:  { opacity: 0.7 },

  inkText:        { color: colors.ink },
  mutedText:      { color: colors.textSecondary },
  indigoDeepText: { color: colors.indigoDeep },
  warningText:    { color: colors.warning },
  waitingText:    { color: colors.waiting },
  successText:    { color: colors.success },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               sp.sm,
    paddingHorizontal: sp.sm,
    paddingVertical:   sp.xs,
  },
  back: {
    width:          sizes.tapTarget,
    height:         sizes.tapTarget,
    borderRadius:   sizes.tapTarget / 2,
    alignItems:     'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: sp.lg, paddingBottom: sp.lg, gap: sp.md },

  hero:          { alignItems: 'center', gap: sp.sm, paddingVertical: sp.lg },
  card:          { gap: sp.xs },
  missingBubble: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: colors.indigoTint,
    alignItems:      'center',
    justifyContent:  'center',
  },

  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               sp.xs,
    minHeight:         28,
    paddingHorizontal: sp.sm + 2,
    borderRadius:      radius.pill,
    backgroundColor:   colors.indigoTint,
  },
  pillAmber:   { backgroundColor: colors.waitingSoft },
  pillSuccess: { backgroundColor: colors.successSoft },

  banner: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           sp.sm,
    padding:       sp.md,
    borderRadius:  radius.childCard,
  },
  bannerAmber:   { backgroundColor: colors.waitingSoft },
  bannerIndigo:  { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.indigo },
  bannerSuccess: { backgroundColor: colors.successSoft },

  // Due / Asked by / Points. Label and value wrap onto two lines under a
  // large font instead of clipping.
  facts: { gap: sp.xs, paddingVertical: sp.sm },
  fact: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    alignItems:    'center',
    gap:           sp.sm,
    minHeight:     sizes.tapTarget,
  },
  factLabel: { flexGrow: 1, flexShrink: 1 },
  factValue: { flexShrink: 1, alignItems: 'flex-end' },
  valueText: { textAlign: 'right' },

  bar: {
    gap:               sp.sm,
    paddingHorizontal: sp.lg,
    paddingTop:        sp.sm,
    paddingBottom:     sp.md,
    backgroundColor:   colors.surface,
    borderTopWidth:    1,
    borderTopColor:    colors.border,
  },
});

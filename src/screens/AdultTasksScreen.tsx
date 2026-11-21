import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { Screen } from '@/components/Screen';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import { hasHouseholdPermission } from '@/domain/permissions';
import {
  actionFullWidth,
  buildAdultTasksModel,
  segmentsInGrid,
  type AdultTaskRow,
  type AdultTasksInput,
  type SegmentSummary,
  type TaskSegment,
} from '@/features/adultTasks/adultTasksModel';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
import { claimOpenTask } from '@/features/tasks/claimOpenTask';
import { completeTask } from '@/features/tasks/completeTask';
import { useAdultText, useBoldCaption } from '@/screens/AdultHomeScreen';
import {
  selectCanApproveTaskCompletion,
  selectCanCreateTasks,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectTasks,
} from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, lockedSpacing as sp, radius, sizes } from '@/theme';

// Slice 6B: Adult Tasks (Board 07, adult tokens from Board 14). A compact
// management list in four segments: Open · Waiting · Sent back · Done.
//   - Every row comes from buildAdultTasksModel (existing task state rule,
//     existing permissions). The screen renders and triggers flows only.
//   - Scan order is fixed on every row: title, assignee · due, state,
//     Points (a gold pill on the right, only for the task's real Points).
//   - Waiting rows: "Review" opens the Slice 6A AdultReview route through
//     onReview. No decision is made here.
//   - Open rows keep the existing actions: claim an open-to-anyone task,
//     and Complete the viewer's own task (the old My Tasks view), through
//     the existing claimOpenTask / completeTask.
//   - New opens the existing Create mission form through onNewMission.
//   - States are a word plus an icon: Waiting amber, Sent back indigo
//     (never red), Done quiet success. No Edit, Archive or Delete.
// The screen is navigation-free: the shell passes the callbacks in.

const STATE_ICON: Record<TaskSegment, keyof typeof Ionicons.glyphMap> = {
  open:      'ellipse-outline',
  waiting:   'time-outline',
  sent_back: 'arrow-undo-outline',
  done:      'checkmark-circle-outline',
};

function useAdultTasksInput(): AdultTasksInput {
  const tasks           = useAppStore(selectTasks);
  const taskSubmissions = useAppStore((s) => s.taskSubmissions);
  const household       = useAppStore(selectCurrentHousehold);
  const user            = useAppStore(selectCurrentUser);
  const role            = useAppStore(selectCurrentMemberRole);
  const canCreateTasks  = useAppStore(selectCanCreateTasks);
  const canReviewTasks  = useAppStore(selectCanApproveTaskCompletion);
  return useMemo(() => ({
    tasks,
    taskSubmissions,
    members:  household?.members ?? [],
    viewerId: user?.id ?? null,
    permissions: {
      canCreateTasks,
      canReviewTasks,
      canClaimOpen:     hasHouseholdPermission(role, 'tasks.claim_open'),
      canCompleteTasks: hasHouseholdPermission(role, 'tasks.complete'),
    },
    now: new Date(),
  }), [tasks, taskSubmissions, household, user, role, canCreateTasks, canReviewTasks]);
}

function SegmentControl({ segments, selected, onSelect }: {
  segments: SegmentSummary[]; selected: TaskSegment; onSelect: (s: TaskSegment) => void;
}) {
  const t = useAdultText();
  const boldCaption = useBoldCaption();
  const { width, fontScale } = useWindowDimensions();
  const grid = segmentsInGrid(width, fontScale);
  return (
    <View style={[styles.segments, grid && styles.segmentsGrid]} accessibilityRole="tablist" accessibilityLabel={copy.adultTasks.segmentsA11y}>
      {segments.map((s) => {
        const on = s.key === selected;
        return (
          <Pressable
            key={s.key}
            onPress={() => onSelect(s.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            accessibilityLabel={s.a11yLabel}
            style={[styles.segment, grid && styles.segmentHalf, on && styles.segmentOn]}>
            <Text style={[t('title'), on ? styles.indigoInk : styles.muted]}>{s.label}</Text>
            {s.count > 0 ? (
              <View style={styles.segmentCount}>
                <Text style={[boldCaption, styles.onIndigo]}>{s.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function StatePill({ segment, label }: { segment: TaskSegment; label: string }) {
  const boldCaption = useBoldCaption();
  const tone = STATE_TONE[segment];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Ionicons name={STATE_ICON[segment]} size={14} color={tone.fg} />
      <Text style={[boldCaption, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

function TaskRow({ row, first, fullWidth, busy, onAction }: {
  row: AdultTaskRow; first: boolean; fullWidth: boolean; busy: boolean; onAction: (row: AdultTaskRow) => void;
}) {
  const t = useAdultText();
  const boldCaption = useBoldCaption();
  const member = useAppStore((s) => (row.task.assigneeId ? s.household?.members.find((m) => m.userId === row.task.assigneeId) : undefined));
  return (
    <View style={[styles.row, !first && styles.rowDivider]}>
      <View style={styles.rowTop} accessible accessibilityLabel={row.a11yLabel}>
        {row.isAnyone ? (
          <View style={styles.anyoneAvatar}>
            <Ionicons name="people-outline" size={18} color={colors.indigo} />
          </View>
        ) : (
          <FamilyAvatar name={row.assigneeName} avatarUrl={member?.avatarUrl} avatarEmoji={member?.avatarEmoji} size={32} />
        )}
        <View style={styles.flex}>
          <Text style={[t('title'), styles.ink]}>{row.title}</Text>
          <Text style={[t('caption'), styles.muted]}>{`${row.assigneeName} · ${row.dueLabel}`}</Text>
          <View style={styles.stateLine}>
            <StatePill segment={row.segment} label={row.stateLabel} />
          </View>
        </View>
        {row.pointsLabel ? (
          <View style={styles.pointsPill}>
            <Text style={[boldCaption, styles.onGold]}>{row.pointsLabel}</Text>
          </View>
        ) : null}
      </View>
      {row.action ? (
        <Pressable
          onPress={() => onAction(row)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={row.actionA11yLabel ?? undefined}
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [styles.actionButton, fullWidth && styles.fullWidth, busy && styles.dim, pressed && styles.outlinePressed]}>
          <Text style={[t('title'), styles.indigoInk]}>{row.actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AdultTasksScreen({ onReview, onNewMission }: {
  onReview:     (taskId: string) => void;
  onNewMission: () => void;
}) {
  const t = useAdultText();
  const refreshControl = useHouseholdRefreshControl();
  const input = useAdultTasksInput();
  const model = useMemo(() => buildAdultTasksModel(input), [input]);
  const household = useAppStore(selectCurrentHousehold);
  const role      = useAppStore(selectCurrentMemberRole);
  const { width, fontScale } = useWindowDimensions();
  const fullWidth = actionFullWidth(width, fontScale);

  const [selected, setSelected] = useState<TaskSegment>('open');
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  // One tap = one request (a second tap before the re-render is dropped).
  const inFlight = useRef(false);

  // The existing flows, with the existing result copy (old My Tasks /
  // old adult Home). Review only navigates.
  async function handleAction(row: AdultTaskRow) {
    if (row.action === 'review') { onReview(row.task.id); return; }
    if (inFlight.current || !household || !input.viewerId) return;
    inFlight.current = true;
    setBusyId(row.task.id);
    setFeedback(null);
    try {
      if (row.action === 'claim') {
        const result = await claimOpenTask({ taskId: row.task.id, householdId: household.id, profileId: input.viewerId, role });
        if (!result.ok) setFeedback(result.reason === 'already_claimed' ? copy.activityCard.alreadyClaimed : copy.activityCard.claimError);
      } else if (row.action === 'complete') {
        const result = await completeTask({ taskId: row.task.id, householdId: household.id, role });
        if (!result.ok) {
          setFeedback(result.reason === 'not_authorized'
            ? copy.activityCard.completeNotAllowed
            : result.reason === 'not_open' ? copy.activityCard.completeNotOpen : copy.activityCard.completeError);
        }
      }
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  }

  const rows = model.rows[selected];

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={refreshControl}>
        <View style={styles.header}>
          <Text style={[t('h1'), styles.ink, styles.flex]} accessibilityRole="header">{copy.adultTasks.title}</Text>
          {model.canCreate ? (
            <Pressable
              onPress={onNewMission}
              accessibilityRole="button"
              accessibilityLabel={copy.adultTasks.newA11y}
              accessibilityHint={copy.adultTasks.newHint}
              style={({ pressed }) => [styles.newButton, pressed && styles.primaryPressed]}>
              <Ionicons name="add" size={20} color={colors.textOnColor} />
              <Text style={[t('title'), styles.onIndigo]}>{copy.adultTasks.newLabel}</Text>
            </Pressable>
          ) : null}
        </View>

        <SegmentControl segments={model.segments} selected={selected} onSelect={setSelected} />

        <Card density="adult" style={styles.card}>
          <Text style={[t('overline'), styles.muted, styles.cardHeading]} accessibilityRole="header">
            {copy.adultTasks.headings[selected]}
          </Text>
          {rows.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name={STATE_ICON[selected]} size={20} color={colors.textSecondary} />
              <Text style={[t('body'), styles.muted, styles.flex]}>{copy.adultTasks.empty[selected]}</Text>
            </View>
          ) : (
            rows.map((row, i) => (
              <TaskRow
                key={row.task.id}
                row={row}
                first={i === 0}
                fullWidth={fullWidth}
                busy={busyId === row.task.id}
                onAction={(r) => { void handleAction(r); }}
              />
            ))
          )}
        </Card>
        {feedback ? <Banner tone="danger" text={feedback} /> : null}
      </ScrollView>
    </Screen>
  );
}

// Board 14 semantic tones. Gold is only the Points pill.
const STATE_TONE: Record<TaskSegment, { bg: string; fg: string }> = {
  open:      { bg: colors.surfaceMuted, fg: colors.textSecondary },
  waiting:   { bg: colors.waitingSoft,  fg: colors.waiting },
  sent_back: { bg: colors.indigoTint,   fg: colors.indigoDeep },
  done:      { bg: colors.successSoft,  fg: colors.success },
};

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
  onGold: { color: colors.onGold },
  dim: { opacity: 0.6 },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
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
  segments: {
    flexDirection:   'row',
    gap:             sp.xs,
    padding:         sp.xs,
    borderRadius:    radius.control,
    backgroundColor: colors.surfaceMuted,
  },
  segmentsGrid: { flexWrap: 'wrap' },
  segment: {
    flex:              1,
    minHeight:         sizes.tapTarget,
    paddingHorizontal: sp.sm,
    borderRadius:      radius.chip,
    flexDirection:     'row',
    flexWrap:          'wrap',
    alignItems:        'center',
    alignContent:      'center',
    justifyContent:    'center',
    gap:               sp.xs,
  },
  segmentHalf: { flexBasis: '45%' },
  segmentOn: {
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  segmentCount: {
    minWidth:          20,
    paddingHorizontal: 6,
    borderRadius:      radius.pill,
    backgroundColor:   colors.indigo,
    alignItems:        'center',
  },
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
    paddingVertical: sp.md,
    gap:             sp.sm,
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
  anyoneAvatar: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: colors.indigoTint,
    alignItems:      'center',
    justifyContent:  'center',
  },
  stateLine: {
    flexDirection: 'row',
    marginTop:     sp.xs,
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
  actionButton: {
    alignSelf:         'flex-end',
    minHeight:         sizes.adultButton,
    paddingHorizontal: sp.lg,
    borderRadius:      radius.control,
    borderWidth:       1.5,
    borderColor:       colors.indigo,
    backgroundColor:   colors.surface,
    alignItems:        'center',
    justifyContent:    'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  outlinePressed: { backgroundColor: colors.indigoTint },
});

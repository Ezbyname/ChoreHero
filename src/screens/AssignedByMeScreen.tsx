import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ActivityList } from '@/components/ActivityList';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { TextField } from '@/components/ui/TextField';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { TaskAdapter } from '@/domain/adapters';
import { toDateOnlyISOString, toTimedISOString } from '@/domain/dateFormat';
import { createTask } from '@/features/tasks/createTask';
import {
  INITIAL_CREATE_PHASE,
  createSingleFlight,
  onCreateTaskEdited,
  onCreateTaskResult,
  onCreateTaskStarted,
  onCreateTaskThrew,
  shouldResetCreateForm,
  type CreateTaskPhase,
} from '@/features/tasks/createTaskFormState';
import { getTasksCreatedByUser } from '@/features/tasks/taskFilters';
import { deriveTaskStatus, latestSubmissionByTask, type TaskStatusKey } from '@/features/tasks/taskListSections';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
import { useAppStore } from '@/store/useAppStore';
import {
  selectCanCreateTasks,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectTasks,
} from '@/store/selectors';
import { colors, radius, sizes, spacing, typography } from '@/theme';

const STATUS_LABEL: Record<TaskStatusKey, string> = {
  open:               copy.taskStatus.open,
  open_to_anyone:     copy.taskStatus.openToAnyone,
  in_progress:        copy.taskStatus.inProgress,
  waiting_for_review: copy.taskStatus.waitingForReview,
  completed:          copy.taskStatus.completed,
  needs_retry:        copy.taskStatus.needsRetry,
  taken_back:         copy.taskStatus.takenBack,
};

// null in this picker means "Open to anyone" (no assignee) — an Open Task.
type AssigneeChoice = string | null;

const DESCRIPTION_MAX_LENGTH = 500; // P2-D01/P2-D09: enforced here, UI layer only.

export function CreateTaskForm({
  householdId,
  createdByProfileId,
  role,
}: {
  householdId:        string;
  createdByProfileId: string;
  role:                string | null;
}) {
  const household = useAppStore(selectCurrentHousehold);
  const members   = household?.members ?? [];

  const [title, setTitle]               = useState('');
  const [description, setDescription]   = useState('');
  const [assignee, setAssignee]         = useState<AssigneeChoice>(null);
  const [pointsText, setPointsText]     = useState('');
  // P2-D03: dueDate is the calendar date + (if hasTime) the time-of-day the
  // user picked. hasTime is set only by explicitly using the time picker —
  // never inferred, never defaulted (P2-D10).
  const [dueDate, setDueDate]           = useState<Date | null>(null);
  const [hasTime, setHasTime]           = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [phase, setPhase]               = useState<CreateTaskPhase>(INITIAL_CREATE_PHASE);
  const [validation, setValidation]     = useState<string | null>(null);
  // One tap = one task: a second tap that lands before the disabled state
  // re-renders is dropped here.
  const singleFlight = useRef(createSingleFlight()).current;
  const isSubmitting = phase.kind === 'submitting';

  // P2-D05: warning only, never blocks submission.
  const isPastDue = dueDate != null && dueDate.getTime() < Date.now();

  function handleDateChange(_event: unknown, selected?: Date) {
    setShowDatePicker(false);
    if (!selected) return;
    setDueDate((prev) => {
      const next = new Date(selected);
      if (prev && hasTime) {
        next.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
      }
      return next;
    });
  }

  function handleTimeChange(_event: unknown, selected?: Date) {
    setShowTimePicker(false);
    if (!selected) return;
    setHasTime(true);
    setDueDate((prev) => {
      const base = prev ?? new Date();
      const next = new Date(base);
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      return next;
    });
  }

  function handleRemoveDueDate() {
    setDueDate(null);
    setHasTime(false);
  }

  function handleRemoveTime() {
    setHasTime(false);
  }

  function edited() {
    setPhase(onCreateTaskEdited);
  }

  async function handleCreate() {
    await singleFlight(() => doCreate());
  }

  async function doCreate() {
    if (isSubmitting) return;

    const trimmed = title.trim();
    if (!trimmed) {
      setValidation(copy.createTask.validationEmpty);
      return;
    }
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      setValidation(copy.createTask.descriptionTooLong);
      return;
    }

    setValidation(null);
    setPhase(onCreateTaskStarted());

    const points = pointsText.trim() ? Number(pointsText.trim()) : undefined;

    const dueAt = dueDate
      ? (hasTime
          ? toTimedISOString(dueDate)
          : toDateOnlyISOString(dueDate.getFullYear(), dueDate.getMonth() + 1, dueDate.getDate()))
      : undefined;

    let next: CreateTaskPhase;
    try {
      const result = await createTask({
        householdId,
        title:               trimmed,
        description:         description.trim() || undefined,
        createdByProfileId,
        assigneeProfileId:  assignee,
        dueAt,
        dueAtHasTime:        dueAt ? hasTime : undefined,
        points:              Number.isFinite(points) ? points : undefined,
        role,
      });
      next = onCreateTaskResult(result, trimmed);
    } catch {
      next = onCreateTaskThrew();
    }

    // Success: clear for the next task. Failure: keep everything typed.
    if (shouldResetCreateForm(next)) {
      setTitle('');
      setDescription('');
      setAssignee(null);
      setPointsText('');
      setDueDate(null);
      setHasTime(false);
    }
    setPhase(next);
  }

  return (
    <View style={styles.section}>
      <SectionHeader title={copy.createTask.title} />
      <Card style={styles.formCard}>
      {phase.kind === 'created' && (
        <Banner
          tone="success"
          title={copy.createTask.success}
          text={formatCopy(copy.createTask.successDetail, { title: phase.title })}
        />
      )}

      <TextField
        label={copy.createTask.titleLabel}
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          edited();
          if (validation) setValidation(null);
        }}
        placeholder={copy.createTask.fieldPlaceholder}
        editable={!isSubmitting}
        returnKeyType="done"
        error={validation}
      />

      <TextField
        label={copy.createTask.descriptionLabel}
        value={description}
        onChangeText={setDescription}
        placeholder={copy.createTask.descriptionPlaceholder}
        editable={!isSubmitting}
        multiline
        maxLength={DESCRIPTION_MAX_LENGTH}
      />

      <Text style={styles.label}>{copy.createTask.assigneeLabel}</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, assignee === null && styles.chipActive]}
          onPress={() => setAssignee(null)}
          disabled={isSubmitting}
          activeOpacity={0.7}
        >
          <Text style={[styles.chipText, assignee === null && styles.chipTextActive]}>
            {copy.createTask.openToAnyone}
          </Text>
        </TouchableOpacity>
        {members.map((m) => (
          <TouchableOpacity
            key={m.userId}
            style={[styles.chip, assignee === m.userId && styles.chipActive]}
            onPress={() => setAssignee(m.userId)}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, assignee === m.userId && styles.chipTextActive]}>
              {m.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{copy.createTask.dueDateLabel}</Text>
      {dueDate ? (
        <>
          <View style={styles.dueDateRow}>
            <Text style={styles.dueDateText}>
              {dueDate.toDateString()}{hasTime ? ` · ${dueDate.toTimeString().slice(0, 5)}` : ''}
            </Text>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} disabled={isSubmitting}>
              <Text style={styles.linkText}>{copy.createTask.dueDateLabel}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chipRow}>
            {!hasTime ? (
              <TouchableOpacity
                style={styles.chip}
                onPress={() => setShowTimePicker(true)}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text style={styles.chipText}>{copy.createTask.addTimeButton}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.chip}
                onPress={handleRemoveTime}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text style={styles.chipText}>{copy.createTask.removeTimeButton}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.chip}
              onPress={handleRemoveDueDate}
              disabled={isSubmitting}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText}>{copy.createTask.removeDueDateButton}</Text>
            </TouchableOpacity>
          </View>
          {isPastDue && <Text style={styles.validationText}>{copy.createTask.pastDueWarning}</Text>}
        </>
      ) : (
        <>
          <TouchableOpacity
            style={styles.chip}
            onPress={() => setShowDatePicker(true)}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Text style={styles.chipText}>{copy.createTask.addDueDateButton}</Text>
          </TouchableOpacity>
          {/* P2-D10: non-blocking recommendation only — never prevents/delays creation. */}
          <Text style={styles.recommendationText}>{copy.createTask.dueDateRecommendation}</Text>
        </>
      )}
      {showDatePicker && (
        <DateTimePicker
          value={dueDate ?? new Date()}
          mode="date"
          onChange={handleDateChange}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={dueDate ?? new Date()}
          mode="time"
          onChange={handleTimeChange}
        />
      )}

      <TextField
        label={copy.createTask.pointsLabel}
        value={pointsText}
        onChangeText={setPointsText}
        placeholder={copy.createTask.pointsPlaceholder}
        keyboardType="number-pad"
        editable={!isSubmitting}
      />

      {phase.kind === 'failed' && <Banner tone="danger" text={copy.createTask.error} />}

      <AppButton
        label={copy.createTask.button}
        icon="add-circle-outline"
        onPress={() => { void handleCreate(); }}
        busy={isSubmitting}
        busyLabel={copy.createTask.creating}
        style={styles.createButton}
      />
      </Card>
    </View>
  );
}

// headerAccessory: optional navigation slot passed in by the tab shell (Slice 4).
// The screen itself never navigates.
export function AssignedByMeScreen({ headerAccessory }: { headerAccessory?: React.ReactNode } = {}) {
  const refreshControl = useHouseholdRefreshControl();
  const tasks         = useAppStore(selectTasks);
  const household      = useAppStore(selectCurrentHousehold);
  const user             = useAppStore(selectCurrentUser);
  const role              = useAppStore(selectCurrentMemberRole);
  const canCreateTasks     = useAppStore(selectCanCreateTasks);
  const taskSubmissions    = useAppStore((s) => s.taskSubmissions);
  const members = household?.members ?? [];

  // Newest first, so a just-created task is at the top of the list.
  const myAssignedTasks = useMemo(
    () => (user ? getTasksCreatedByUser(tasks, user.id) : [])
      .slice()
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [tasks, user],
  );
  // Status shown on every card, from the real task + latest submission
  // state. Display only: these cards carry no actions here.
  const activities = useMemo(
    () => myAssignedTasks.map(TaskAdapter.toFamilyActivity).map((a) => ({ ...a, availableActions: [] })),
    [myAssignedTasks],
  );
  const latest = useMemo(() => latestSubmissionByTask(taskSubmissions), [taskSubmissions]);
  const taskById = useMemo(() => new Map(myAssignedTasks.map((t) => [t.id, t])), [myAssignedTasks]);

  return (
    <Screen style={styles.screen}>
      <ScreenHeader
        title={copy.screens.assigned.title}
        subtitle={copy.screens.assigned.subtitle}
        accessory={headerAccessory}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} refreshControl={refreshControl}>
        {canCreateTasks && household && user && (
          <CreateTaskForm
            householdId={household.id}
            createdByProfileId={user.id}
            role={role}
          />
        )}

        {myAssignedTasks.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState message={copy.emptyStates.assigned} emoji="📋" />
          </View>
        ) : (
          <View style={styles.section}>
            <SectionHeader title={copy.createTask.yourTasksTitle} count={myAssignedTasks.length} />
            <ActivityList
              activities={activities}
              members={members}
              decorate={(a) => {
                const task = taskById.get(a.id);
                if (!task) return undefined;
                const s = deriveTaskStatus(task, latest.get(a.id));
                return { status: { label: STATUS_LABEL[s.key], tone: s.tone } };
              }}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom:     spacing.xxxl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  formCard: {
    gap: spacing.sm,
  },
  empty: {
    minHeight: 220,
  },
  createButton: {
    marginTop: spacing.md,
  },
  label: {
    ...typography.label,
    color:        colors.textSecondary,
    marginTop:    spacing.sm,
    marginBottom: spacing.xs,
  },



  validationText: {
    ...typography.caption,
    color: colors.danger,
  },
  recommendationText: {
    ...typography.caption,
    color:     colors.textSecondary,
    marginTop: spacing.xs,
  },
  dueDateRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   spacing.xs,
  },
  dueDateText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  linkText: {
    ...typography.caption,
    color:      colors.primary,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.xs,
  },
  chip: {
    minHeight:         40,
    justifyContent:    'center',
    borderRadius:      radius.pill,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs,
  },
  chipActive: {
    borderColor:     colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    ...typography.caption,
    color:      colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.primary,
  },

});

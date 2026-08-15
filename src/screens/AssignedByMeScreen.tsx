import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ActivityList } from '@/components/ActivityList';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { TaskAdapter } from '@/domain/adapters';
import { toDateOnlyISOString, toTimedISOString } from '@/domain/dateFormat';
import { createTask } from '@/features/tasks/createTask';
import { getTasksCreatedByUser } from '@/features/tasks/taskFilters';
import { useAppStore } from '@/store/useAppStore';
import {
  selectCanCreateTasks,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectTasks,
} from '@/store/selectors';
import { colors, radius, spacing, typography } from '@/theme';

// null in this picker means "Open to anyone" (no assignee) — an Open Task.
type AssigneeChoice = string | null;

const DESCRIPTION_MAX_LENGTH = 500; // P2-D01/P2-D09: enforced here, UI layer only.

function CreateTaskForm({
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback]         = useState<string | null>(null);
  const [validation, setValidation]     = useState<string | null>(null);

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

  async function handleCreate() {
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
    setFeedback(null);
    setIsSubmitting(true);

    const points = pointsText.trim() ? Number(pointsText.trim()) : undefined;

    const dueAt = dueDate
      ? (hasTime
          ? toTimedISOString(dueDate)
          : toDateOnlyISOString(dueDate.getFullYear(), dueDate.getMonth() + 1, dueDate.getDate()))
      : undefined;

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

    if (result.ok) {
      setTitle('');
      setDescription('');
      setAssignee(null);
      setPointsText('');
      setDueDate(null);
      setHasTime(false);
      setFeedback(copy.createTask.success);
    } else {
      setFeedback(copy.createTask.error);
    }
    setIsSubmitting(false);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{copy.createTask.title}</Text>

      <TextInput
        style={[styles.input, validation && styles.inputError]}
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          if (validation) setValidation(null);
        }}
        placeholder={copy.createTask.fieldPlaceholder}
        placeholderTextColor={colors.textMuted}
        editable={!isSubmitting}
        returnKeyType="done"
      />
      {validation && <Text style={styles.validationText}>{validation}</Text>}

      <Text style={styles.label}>{copy.createTask.descriptionLabel}</Text>
      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={description}
        onChangeText={setDescription}
        placeholder={copy.createTask.descriptionPlaceholder}
        placeholderTextColor={colors.textMuted}
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

      <Text style={styles.label}>{copy.createTask.pointsLabel}</Text>
      <TextInput
        style={styles.input}
        value={pointsText}
        onChangeText={setPointsText}
        placeholder={copy.createTask.pointsPlaceholder}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        editable={!isSubmitting}
      />

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={isSubmitting}
        activeOpacity={0.8}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : (
          <Text style={styles.buttonText}>{copy.createTask.button}</Text>
        )}
      </TouchableOpacity>

      {feedback && <Text style={styles.feedbackText}>{feedback}</Text>}
    </View>
  );
}

export function AssignedByMeScreen() {
  const tasks         = useAppStore(selectTasks);
  const household      = useAppStore(selectCurrentHousehold);
  const user             = useAppStore(selectCurrentUser);
  const role              = useAppStore(selectCurrentMemberRole);
  const canCreateTasks     = useAppStore(selectCanCreateTasks);
  const members = household?.members ?? [];

  const myAssignedTasks = useMemo(
    () => (user ? getTasksCreatedByUser(tasks, user.id) : []),
    [tasks, user],
  );
  const activities = useMemo(
    () => myAssignedTasks.map(TaskAdapter.toFamilyActivity),
    [myAssignedTasks],
  );

  return (
    <Screen style={styles.screen}>
      <ScreenHeader
        title={copy.screens.assigned.title}
        subtitle={copy.screens.assigned.subtitle}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {canCreateTasks && household && user && (
          <CreateTaskForm
            householdId={household.id}
            createdByProfileId={user.id}
            role={role}
          />
        )}

        {myAssignedTasks.length === 0 ? (
          <EmptyState message={copy.emptyStates.assigned} emoji="📋" />
        ) : (
          <ActivityList activities={activities} members={members} />
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
  sectionTitle: {
    ...typography.body,
    color:        colors.textPrimary,
    fontWeight:   '600',
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    color:      colors.textMuted,
    fontWeight: '600',
    marginTop:  spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    color:             colors.textPrimary,
    backgroundColor:   colors.surface,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
  },
  multilineInput: {
    minHeight:   72,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#B91C1C',
  },
  validationText: {
    ...typography.caption,
    color: '#B91C1C',
  },
  recommendationText: {
    ...typography.caption,
    color:     colors.textMuted,
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
    borderRadius:      radius.pill,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
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
  button: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    alignItems:      'center',
    marginTop:       spacing.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    color:      colors.surface,
    fontWeight: '600',
  },
  feedbackText: {
    ...typography.caption,
    color:     colors.textMuted,
    marginTop: spacing.sm,
  },
});

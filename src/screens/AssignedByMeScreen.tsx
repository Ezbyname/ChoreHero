import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ActivityList } from '@/components/ActivityList';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { TaskAdapter } from '@/domain/adapters';
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
  const [assignee, setAssignee]         = useState<AssigneeChoice>(null);
  const [pointsText, setPointsText]     = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback]         = useState<string | null>(null);
  const [validation, setValidation]     = useState<string | null>(null);

  async function handleCreate() {
    if (isSubmitting) return;

    const trimmed = title.trim();
    if (!trimmed) {
      setValidation(copy.createTask.validationEmpty);
      return;
    }

    setValidation(null);
    setFeedback(null);
    setIsSubmitting(true);

    const points = pointsText.trim() ? Number(pointsText.trim()) : undefined;

    const result = await createTask({
      householdId,
      title:               trimmed,
      createdByProfileId,
      assigneeProfileId:  assignee,
      points:              Number.isFinite(points) ? points : undefined,
      role,
    });

    if (result.ok) {
      setTitle('');
      setAssignee(null);
      setPointsText('');
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
  inputError: {
    borderColor: '#B91C1C',
  },
  validationText: {
    ...typography.caption,
    color: '#B91C1C',
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

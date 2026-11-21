import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityList } from '@/components/ActivityList';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Banner } from '@/components/ui/Banner';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { copy } from '@/content/copy';
import { appSounds } from '@/features/sounds/appSounds';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import { TaskAdapter } from '@/domain/adapters';
import type { ActivityAction, FamilyActivity } from '@/domain/familyActivity';
import { claimOpenTask } from '@/features/tasks/claimOpenTask';
import { completeTask } from '@/features/tasks/completeTask';
import { PendingCompletionModal, type PendingCompletionModalTask } from '@/features/tasks/components/PendingCompletionModal';
import { TaskCompletionModal, type TaskCompletionModalTask } from '@/features/tasks/components/TaskCompletionModal';
import { getTasksForUser } from '@/features/tasks/taskFilters';
import { applyViewerTaskActions } from '@/features/tasks/taskViewerActions';
import { useHouseholdRefreshControl } from '@/features/sync/useHouseholdRefreshControl';
import { useAppStore } from '@/store/useAppStore';
import {
  selectCanApproveTaskCompletion,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectTasks,
} from '@/store/selectors';
import { spacing } from '@/theme';

// headerAccessory: optional navigation slot passed in by the tab shell (Slice 4).
// The screen itself never navigates.
export function MyTasksScreen({ headerAccessory }: { headerAccessory?: React.ReactNode } = {}) {
  const refreshControl = useHouseholdRefreshControl();
  const tasks     = useAppStore(selectTasks);
  const user      = useAppStore(selectCurrentUser);
  const household = useAppStore(selectCurrentHousehold);
  const role      = useAppStore(selectCurrentMemberRole);
  const canApproveTaskCompletion = useAppStore(selectCanApproveTaskCompletion);
  const members   = household?.members ?? [];

  const myTasks = useMemo(
    () => (user ? getTasksForUser(tasks, user.id) : []),
    [tasks, user],
  );

  // Mirrors TodayScreen's own filter: a needs_attention task assigned to
  // the current user is their OWN pending submission here, never someone
  // else's — approve/decline must never show to a non-privileged viewer
  // of their own submission (a child cannot approve their own work).
  // A child's own waiting task gets 'manage_completion' instead (see
  // applyViewerTaskActions).
  const myActivities = useMemo(
    () => myTasks.map(TaskAdapter.toFamilyActivity).map((activity) =>
      applyViewerTaskActions(activity, { canApproveTaskCompletion, viewerId: user?.id ?? null, role }),
    ),
    [myTasks, canApproveTaskCompletion, user, role],
  );

  const [pendingActivityId, setPendingActivityId] = useState<string | null>(null);
  const [feedback, setFeedback]                   = useState<string | null>(null);
  // Target of the shared Task Completion V2 Modal. null when closed.
  // Child-role 'complete' actions open this Modal rather than invoking
  // the legacy v1 requestTaskCompletion path — the Modal drives the
  // approved V2 orchestration (upload + request_task_completion_v2).
  const [completionTarget, setCompletionTarget] = useState<TaskCompletionModalTask | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  // Target of the child's "waiting for review" sheet (Add/Change photos,
  // Cancel completion). null when closed. Both sheets are hosted by THIS
  // screen and nothing in their flows navigates or re-hydrates, so after
  // Cancel / Change photos the child is still on My Tasks.
  const [pendingTarget, setPendingTarget] = useState<PendingCompletionModalTask | null>(null);

  // 'claim'/'complete' branching mirrors TodayScreen's handleTaskAction —
  // see that function's own comment for why 'complete' routes by role
  // (child -> requestTaskCompletion, privileged -> completeTask). 'claim'
  // is included for the same defensive/consistency reasons even though a
  // task already assigned to this user (which is everything on this
  // screen) never actually produces a 'claim' action from the adapter.
  async function handleTaskAction(activity: FamilyActivity, action: ActivityAction) {
    if (pendingActivityId || !household || !user) return;
    if (action === 'manage_completion') {
      // No backend call here — the sheet loads the pending submission and
      // owns the withdraw.
      setPendingTarget({ id: activity.id, householdId: household.id, title: activity.title });
      return;
    }
    if (action !== 'claim' && action !== 'complete') return;

    setPendingActivityId(activity.id);
    setFeedback(null);

    if (action === 'claim') {
      const result = await claimOpenTask({
        taskId:      activity.id,
        householdId: household.id,
        profileId:   user.id,
        role,
      });

      if (!result.ok) {
        setFeedback(
          result.reason === 'already_claimed'
            ? copy.activityCard.alreadyClaimed
            : copy.activityCard.claimError,
        );
      }
    } else if (role === 'child') {
      // Open the shared Task Completion V2 Modal. Nothing is sent to the
      // backend here — the Modal owns the picker, preview, replace/remove
      // and the actual submission through submitTaskCompletionWithEvidence.
      setCompletionTarget({
        id:          activity.id,
        householdId: household.id,
        title:       activity.title,
      });
      setPendingActivityId(null);
      return;
    } else {
      const result = await completeTask({
        taskId:      activity.id,
        householdId: household.id,
        role,
      });

      if (!result.ok) {
        setFeedback(
          result.reason === 'not_authorized'
            ? copy.activityCard.completeNotAllowed
            : result.reason === 'not_open'
              ? copy.activityCard.completeNotOpen
              : copy.activityCard.completeError,
        );
      }
    }

    setPendingActivityId(null);
  }

  return (
    <Screen style={styles.screen}>
      <ScreenHeader
        title={copy.screens.myTasks.title}
        subtitle={copy.screens.myTasks.subtitle}
        accessory={headerAccessory}
      />

      {myTasks.length === 0 ? (
        // Scrollable even when empty: pull-to-refresh is how a child with
        // no tasks yet can fetch one an adult just created.
        <ScrollView contentContainerStyle={styles.emptyScroll} refreshControl={refreshControl}>
          <EmptyState message={copy.emptyStates.myTasks} emoji="✅" />
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          refreshControl={refreshControl}
        >
          <SectionHeader title={copy.screens.myTasks.title} count={myTasks.length} hint={copy.myTasks.summary} />

          <ActivityList
            activities={myActivities}
            members={members}
            onAction={handleTaskAction}
            pendingActivityId={pendingActivityId}
          />
          {feedback && <View style={styles.feedback}><Banner tone="danger" text={feedback} /></View>}
        </ScrollView>
      )}

      <PendingCompletionModal
        task={pendingTarget}
        role={role}
        onReopenForPhoto={(task) => {
          // Withdrawn on the server; the task is open. The completion
          // Modal starts a NEW logical attempt (fresh ids at selection).
          setPendingTarget(null);
          setCompletionNotice(copy.completionSheet.resendNotice);
          setCompletionTarget(task);
        }}
        onClose={() => setPendingTarget(null)}
      />

      <TaskCompletionModal
        task={completionTarget}
        notice={completionNotice}
        onCompleted={(submission) => {
          if (submission) appSounds.play('completion_submitted', submission.id);
          setCompletionTarget(null);
          setCompletionNotice(null);
          // Background refresh only: the card turns into "Waiting for
          // review" right here. A full re-hydration used to replace the
          // whole app with the loading screen and land the child on Today.
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

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom:     spacing.xxxl,
  },
  emptyScroll: {
    flexGrow: 1,
  },
  feedback: {
    marginTop: spacing.sm,
  },
});

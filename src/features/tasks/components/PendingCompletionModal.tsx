import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { copy } from '@/content/copy';
import { appSounds } from '@/features/sounds/appSounds';
import {
  getChildPendingCompletion,
  withdrawChildPendingCompletion,
} from '@/features/tasks/childPendingCompletion';
import { EvidenceGallery } from '@/features/tasks/components/EvidenceGallery';
import {
  INITIAL_PENDING_STATE,
  availablePendingActions,
  onBeginWithdraw,
  onChooseIntent,
  onKeepPending,
  onPendingLoadResult,
  onPendingLoaded,
  onWithdrawResult,
  type PendingCompletionUiState,
  type PendingIntent,
} from '@/features/tasks/components/pendingCompletionUiState';
import { colors, radius, sizes, spacing, typography } from '@/theme';

export interface PendingCompletionModalTask {
  id:          string;
  householdId: string;
  title:       string;
}

type Props = {
  task:  PendingCompletionModalTask | null;
  role:  string | null;
  // Withdrawn for Add/Change photos: the parent opens the completion Modal
  // for the (now open) task, which mints a NEW logical attempt. The parent
  // is the screen the child opened this from, so the child stays there.
  onReopenForPhoto: (task: PendingCompletionModalTask) => void;
  onClose:          () => void;
};

const INTENT_LABEL: Record<PendingIntent, string> = {
  add_photo:    copy.pendingCompletion.addPhoto,
  change_photo: copy.pendingCompletion.changePhoto,
  cancel:       copy.pendingCompletion.cancelCompletion,
};

export function PendingCompletionModal({ task, role, onReopenForPhoto, onClose }: Props) {
  const [state, setState] = useState<PendingCompletionUiState>(INITIAL_PENDING_STATE);
  const { height: windowHeight } = useWindowDimensions();
  // Monotonic run id — async results from a previous open/task are dropped.
  const runIdRef    = useRef(0);
  const inFlightRef = useRef(false);
  const isOpen      = task !== null;

  useEffect(() => {
    runIdRef.current += 1;
    const myRunId = runIdRef.current;
    setState(INITIAL_PENDING_STATE);
    if (task) void load(task.id, myRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Add/Change photos succeeded server-side: hand over to the completion
  // Modal. The task is 'open' now, so nothing is lost if the child then
  // backs out of the picker — the task simply stays on their list.
  useEffect(() => {
    if (state.phase === 'reopen_for_photo' && task) onReopenForPhoto(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  async function load(taskId: string, myRunId: number) {
    const result = await getChildPendingCompletion({ taskId, role });
    if (myRunId !== runIdRef.current) return;
    setState(result.ok ? onPendingLoaded(result.data) : onPendingLoadResult(result.reason));
  }

  async function handleConfirm() {
    if (!task || inFlightRef.current) return;
    const begun = onBeginWithdraw(state);
    if (!begun || begun.phase !== 'withdrawing') return;
    inFlightRef.current = true;
    const myRunId = runIdRef.current;
    setState(begun);
    try {
      const result = await withdrawChildPendingCompletion({
        submissionId: begun.pending.submissionId,
        taskId:       task.id,
        householdId:  task.householdId,
        role,
      });
      // Played on confirmed success only, once per submission.
      if (result.ok) appSounds.play('completion_withdrawn', begun.pending.submissionId);
      if (myRunId !== runIdRef.current) return;
      setState(s => onWithdrawResult(s, result));
    } catch {
      if (myRunId !== runIdRef.current) return;
      setState(s => onWithdrawResult(s, { ok: false, reason: 'failed' }));
    } finally {
      inFlightRef.current = false;
    }
  }

  function handleClose() {
    if (state.phase === 'withdrawing') return; // let the server answer first
    runIdRef.current += 1;
    onClose();
  }

  const pending = state.phase === 'ready' || state.phase === 'confirming' || state.phase === 'withdrawing'
    ? state.pending
    : null;

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <SafeAreaView edges={['bottom']} style={[styles.card, { maxHeight: Math.round(windowHeight * sizes.sheetMaxRatio) }]}>
          <SheetHeader
            title={copy.pendingCompletion.title}
            subtitle={task?.title}
            onClose={handleClose}
            closeLabel={copy.pendingCompletion.close}
            closeDisabled={state.phase === 'withdrawing'}
          />

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {state.phase === 'loading' && (
              <View style={styles.centerRow} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.hint}>{copy.pendingCompletion.loading}</Text>
              </View>
            )}

            {state.phase === 'load_failed' && <Banner tone="danger" text={copy.pendingCompletion.loadFailed} />}
            {state.phase === 'gone' && <Banner tone="info" text={copy.pendingCompletion.gone} />}
            {state.phase === 'cancelled' && <Banner tone="success" text={copy.pendingCompletion.cancelled} />}

            {pending && (
              <>
                <Text style={styles.hint}>{copy.pendingCompletion.hint}</Text>
                <Text style={styles.sectionLabel}>{copy.pendingCompletion.yourPhotos}</Text>
                {pending.photoCount > 0 ? (
                  <EvidenceGallery submissionId={pending.submissionId} photoCount={pending.photoCount} />
                ) : (
                  <Text style={styles.hint}>{copy.pendingCompletion.noPhotoSent}</Text>
                )}
              </>
            )}

            {(state.phase === 'confirming' || state.phase === 'withdrawing') && (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmTitle}>
                  {state.intent === 'cancel' ? copy.pendingCompletion.confirmCancelTitle : copy.pendingCompletion.confirmPhotoTitle}
                </Text>
                <Text style={styles.hint}>
                  {state.intent === 'cancel' ? copy.pendingCompletion.confirmCancelBody : copy.pendingCompletion.confirmPhotoBody}
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {state.phase === 'load_failed' && (
              <AppButton
                label={copy.pendingCompletion.retry}
                variant="secondary"
                icon="refresh"
                onPress={() => {
                  if (!task) return;
                  const myRunId = ++runIdRef.current;
                  setState(INITIAL_PENDING_STATE);
                  void load(task.id, myRunId);
                }}
              />
            )}

            {state.phase === 'ready' && (
              <>
                {state.error === 'action_failed' && <Banner tone="danger" text={copy.pendingCompletion.actionFailed} />}
                {availablePendingActions(state.pending).map((intent) => (
                  <AppButton
                    key={intent}
                    label={INTENT_LABEL[intent]}
                    variant={intent === 'cancel' ? 'dangerOutline' : 'primary'}
                    icon={intent === 'cancel' ? 'arrow-undo-outline' : 'images-outline'}
                    onPress={() => setState(s => onChooseIntent(s, intent))}
                  />
                ))}
              </>
            )}

            {(state.phase === 'confirming' || state.phase === 'withdrawing') && (
              <>
                <AppButton
                  label={state.intent === 'cancel' ? copy.pendingCompletion.confirmCancel : copy.pendingCompletion.confirmPhoto}
                  variant={state.intent === 'cancel' ? 'danger' : 'primary'}
                  busy={state.phase === 'withdrawing'}
                  busyLabel={copy.pendingCompletion.working}
                  onPress={() => { void handleConfirm(); }}
                />
                <AppButton
                  label={copy.pendingCompletion.keep}
                  variant="secondary"
                  disabled={state.phase === 'withdrawing'}
                  onPress={() => setState(s => onKeepPending(s))}
                />
              </>
            )}

            {(state.phase === 'gone' || state.phase === 'cancelled') && (
              <AppButton label={copy.pendingCompletion.close} onPress={handleClose} />
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: colors.overlay,
    justifyContent:  'flex-end',
  },
  card: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    padding:              spacing.xl,
    gap:                  spacing.md,
  },
  body: {
    flexGrow:   0,
    flexShrink: 1,
  },
  bodyContent: {
    gap: spacing.md,
  },
  footer: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  confirmBox: {
    gap:             spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius:    radius.md,
    padding:         spacing.md,
  },
  confirmTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
});

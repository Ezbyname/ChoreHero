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
import { approveTaskCompletionSubmission } from '@/features/tasks/approveTaskCompletionSubmission';
import { EvidenceGallery } from '@/features/tasks/components/EvidenceGallery';
import { evidencePhotoCount, getTaskCompletionReviewContext } from '@/features/tasks/getTaskCompletionReviewContext';
import { rejectTaskCompletionSubmission } from '@/features/tasks/rejectTaskCompletionSubmission';
import { colors, radius, sizes, spacing, typography } from '@/theme';
import {
  canConfirmDecision,
  initialReviewState,
  isTerminalPhase,
  onActionFailed,
  onActionNotAuthorized,
  onActionNotPending,
  onBeginApprove,
  onBeginReject,
  onContextFailed,
  onContextLoaded,
  onContextNotAuthorized,
  onContextNotFound,
  onEvidenceFailed,
  onEvidenceLoaded,
  onEvidenceRetry,
  onReturnToReady,
  type ReviewDecision,
  type ReviewErrorKind,
  type TaskReviewUiState,
} from '@/features/tasks/components/taskReviewEvidenceUiState';

export interface TaskReviewEvidenceModalTask {
  id:          string;
  householdId: string;
  title:       string;
}

type Props = {
  task:            TaskReviewEvidenceModalTask | null;
  initialDecision: ReviewDecision | null;
  role:            string | null;
  onCompleted:     () => void;
  onClose:         () => void;
};

// Reviewer sheet. The X in the header is always visible and always closes
// WITHOUT deciding: no approve, no reject, no change to the submission or
// to anyone's points — in every state (loading, photos, error, stale).
// Evidence is read through the session cache (EvidenceGallery), i.e. the
// authorized Edge Function, by submission id + photo index only.
export function TaskReviewEvidenceModal({ task, initialDecision, role, onCompleted, onClose }: Props) {
  const [state, setState] = useState<TaskReviewUiState>(() => initialReviewState(initialDecision ?? 'approve'));
  const { height: windowHeight } = useWindowDimensions();

  // Monotonic run id: async results of a previous open / task / decision
  // are dropped (mirrors the hydrationRunId pattern in the store).
  const runIdRef    = useRef(0);
  const inFlightRef = useRef(false);
  const isOpen      = task !== null && initialDecision !== null;

  useEffect(() => () => { runIdRef.current += 1; }, []);

  useEffect(() => {
    runIdRef.current += 1;
    const myRunId = runIdRef.current;
    if (!isOpen || !task || !initialDecision) {
      setState(initialReviewState('approve'));
      return;
    }
    setState(initialReviewState(initialDecision));
    void loadContext(task.id, myRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, initialDecision]);

  async function loadContext(taskId: string, myRunId: number) {
    const result = await getTaskCompletionReviewContext({ taskId, role });
    if (myRunId !== runIdRef.current) return; // stale — drop
    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':      setState(s => onContextNotFound(s)); return;
        case 'not_authorized': setState(s => onContextNotAuthorized(s)); return;
        case 'failed':         setState(s => onContextFailed(s)); return;
      }
    }
    setState(s => onContextLoaded(s, result.data));
  }

  function handleRetryContext() {
    if (!task) return;
    const myRunId = ++runIdRef.current;
    setState(initialReviewState(state.decision));
    void loadContext(task.id, myRunId);
  }

  async function handleConfirm() {
    if (!task || !state.context) return;
    if (!canConfirmDecision(state))   return;
    if (inFlightRef.current)          return;
    inFlightRef.current = true;
    const myRunId = runIdRef.current;
    try {
      const begun = state.decision === 'approve' ? onBeginApprove(state) : onBeginReject(state);
      if (!begun) return;
      setState(begun);

      const commonInput = {
        submissionId: state.context.submissionId,
        taskId:       task.id,
        householdId:  task.householdId,
        role,
      };
      // The wrappers request a background refresh themselves — including
      // on CH017, so a stale card disappears even if Realtime was missed.
      const result = state.decision === 'approve'
        ? await approveTaskCompletionSubmission(commonInput)
        : await rejectTaskCompletionSubmission(commonInput);

      if (myRunId !== runIdRef.current) return; // modal closed/switched

      if (result.ok) {
        onCompleted();
        return;
      }
      switch (result.reason) {
        case 'not_pending':    setState(s => onActionNotPending(s)); break;
        case 'not_authorized': setState(s => onActionNotAuthorized(s)); break;
        case 'failed':         setState(s => onActionFailed(s)); break;
      }
    } finally {
      inFlightRef.current = false;
    }
  }

  // Never decides anything. A decision already in flight completes on the
  // server regardless; its result is simply dropped here.
  function handleClose() {
    runIdRef.current += 1;
    onClose();
  }

  const isActionBusy     = state.phase === 'approving' || state.phase === 'rejecting';
  const isContextLoading = state.phase === 'loading_context';
  const contextFailed    = state.phase === 'evidence_failed' && state.error?.kind === 'context_failed';
  const terminal         = isTerminalPhase(state);
  const photoCount       = state.context ? evidencePhotoCount(state.context) : 0;
  const confirmEnabled   = canConfirmDecision(state) && !isActionBusy;
  const confirmLabel     = state.decision === 'approve'
                           ? (state.phase === 'approving' ? copy.taskReview.approving : copy.taskReview.confirmApprove)
                           : (state.phase === 'rejecting' ? copy.taskReview.rejecting : copy.taskReview.confirmReject);

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <SafeAreaView edges={['bottom']} style={[styles.card, { maxHeight: Math.round(windowHeight * sizes.sheetMaxRatio) }]}>
          <SheetHeader
            title={copy.taskReview.title}
            subtitle={task?.title}
            onClose={handleClose}
            closeLabel={copy.taskReview.close}
          />

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {isContextLoading && (
              <View style={styles.statusRow} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.hint}>{copy.taskReview.loadingContext}</Text>
              </View>
            )}

            {state.context && photoCount > 0 && !terminal && (
              <>
                {photoCount > 1 && <Text style={styles.hint}>{copy.taskReview.reviewBeforeDeciding}</Text>}
                <EvidenceGallery
                  submissionId={state.context.submissionId}
                  photoCount={photoCount}
                  onPhotoReady={(index, uri) => setState(s => onEvidenceLoaded(s, uri, index))}
                  onPhotoFailed={() => setState(s => onEvidenceFailed(s))}
                  onRetry={() => setState(s => onEvidenceRetry(s))}
                />
              </>
            )}

            {state.phase === 'ready_no_photo' && (
              <Banner tone="neutral" text={copy.taskReview.noPhotoAttached} />
            )}

            {contextFailed && (
              <>
                <Banner tone="danger" text={copy.taskReview.evidenceFailed} />
                <AppButton label={copy.taskReview.retry} variant="secondary" icon="refresh" onPress={handleRetryContext} />
              </>
            )}

            {state.phase === 'action_failed' && (
              <>
                <Banner tone="danger" text={copy.taskReview.actionFailed} />
                <AppButton label={copy.taskReview.retry} variant="secondary" icon="refresh" onPress={() => setState(s => onReturnToReady(s))} />
              </>
            )}

            {terminal && (
              <Banner
                tone="warning"
                text={reviewErrorCopy(state.error?.kind)}
                title={state.phase === 'terminal_not_authorized' ? undefined : copy.taskReview.staleHint}
              />
            )}
          </ScrollView>

          <View style={styles.footer}>
            {terminal ? (
              <AppButton label={copy.taskReview.close} onPress={handleClose} />
            ) : (
              <AppButton
                label={confirmLabel}
                variant={state.decision === 'approve' ? 'primary' : 'danger'}
                disabled={!confirmEnabled}
                busy={isActionBusy}
                busyLabel={confirmLabel}
                onPress={handleConfirm}
              />
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function reviewErrorCopy(kind: ReviewErrorKind | undefined): string {
  switch (kind) {
    case 'context_failed':   return copy.taskReview.evidenceFailed;
    case 'evidence_failed':  return copy.taskReview.evidenceFailed;
    case 'action_failed':    return copy.taskReview.actionFailed;
    case 'not_found':        return copy.taskReview.notPendingAnymore;
    case 'not_pending':      return copy.taskReview.notPendingAnymore;
    case 'not_authorized':   return copy.taskReview.notAuthorized;
    default:                 return copy.taskReview.actionFailed;
  }
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
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
});

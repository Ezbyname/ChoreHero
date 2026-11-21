import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { IconButton } from '@/components/ui/IconButton';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { ChildSubmitEvidence } from '@/features/tasks/components/ChildSubmitEvidence';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { beginCompletionSubmit, finishCompletionSubmit } from '@/features/tasks/components/taskCompletionSubmitFlow';
import { validateEvidenceMimeType } from '@/features/tasks/taskCompletionAttempt';
import { colors, radius, sizes, spacing, typography } from '@/theme';
import type { TaskCompletionSubmissionRow } from '@/types/supabase';
import {
  INITIAL_UI_STATE,
  MAX_EVIDENCE_PHOTOS,
  canAddPhotos,
  canSubmit,
  isTerminalPhase,
  onCameraPermissionDenied,
  onPhotoRemovedAt,
  onPhotoReplacedAt,
  onPhotosAdded,
  onPickerFailed,
  onSubmitInvalidMime,
  onSubmitProgress,
  photoCountLabel,
  remainingPhotoSlots,
  type PhotoSource,
  type SelectedPhoto,
  type TaskCompletionUiState,
  type UiErrorKind,
} from '@/features/tasks/components/taskCompletionUiState';

// expo-crypto randomUUID: native-backed. Kept inline in this native-only
// file so the Node-run tests of the pure modules never import it.
function generateId(): string {
  return Crypto.randomUUID();
}

export type TaskCompletionModalTask = {
  id:          string;
  householdId: string;
  title:       string;
};

type Props = {
  task:        TaskCompletionModalTask | null;
  // Optional one-line context shown above the body, e.g. after the child
  // took back a pending completion to change its photos.
  notice?:     string | null;
  // Called only after the server confirmed the submission.
  onCompleted: (submission: TaskCompletionSubmissionRow | null) => void;
  onClose:     () => void;
  // Slice 5C: 'child' renders the same flow as the full-screen child Submit
  // Evidence screen (Board 20) and shows "Sent!" after a confirmed
  // submission. Omitted = the existing bottom sheet, unchanged (adults).
  variant?:     'sheet' | 'child';
  missionCard?: React.ReactNode;
  // Child only: "Back to missions" on the "Sent!" screen.
  onSentDone?:  () => void;
};

// Picker assets -> accepted photos (allowed MIME only). A disallowed type
// is reported, never uploaded.
function toPhotos(result: ImagePicker.ImagePickerResult, source: PhotoSource): { photos: SelectedPhoto[]; invalid: boolean } {
  if (result.canceled || !result.assets) return { photos: [], invalid: false };
  const photos: SelectedPhoto[] = [];
  let invalid = false;
  for (const asset of result.assets) {
    const mime = asset.mimeType ?? '';
    if (validateEvidenceMimeType(mime) === 'ok') photos.push({ previewUri: asset.uri, mimeType: mime, source });
    else invalid = true;
  }
  return { photos, invalid };
}

export function TaskCompletionModal({ task, notice, onCompleted, onClose, variant = 'sheet', missionCard, onSentDone }: Props) {
  const [state, setState] = useState<TaskCompletionUiState>(INITIAL_UI_STATE);
  // Child only: the task just confirmed by the server, kept for "Sent!"
  // after the parent has already closed the flow (task === null).
  const [sentTask, setSentTask] = useState<TaskCompletionModalTask | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const { height: windowHeight } = useWindowDimensions();

  // Fresh state between tasks: no stale photos, no stale attempt.
  React.useEffect(() => {
    if (task === null) {
      setState(INITIAL_UI_STATE);
      setPreviewIndex(null);
    }
  }, [task]);

  const isSubmitting  = state.phase === 'submitting';
  const isTerminal    = isTerminalPhase(state);
  const isOpen        = task !== null;
  const addEnabled    = canAddPhotos(state);
  const editDisabled  = isSubmitting || isTerminal;
  const submitEnabled = canSubmit(state);

  function accept(result: ImagePicker.ImagePickerResult, source: PhotoSource, replaceIndex: number | null) {
    const { photos, invalid } = toPhotos(result, source);
    if (photos.length > 0) {
      setState((s) => (replaceIndex === null
        ? onPhotosAdded(s, photos, generateId)
        : onPhotoReplacedAt(s, replaceIndex, photos[0], generateId)));
    }
    if (invalid) setState((s) => onSubmitInvalidMime(s));
  }

  async function pickFromCamera(replaceIndex: number | null = null) {
    if (editDisabled || (replaceIndex === null && !addEnabled)) return;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setState((s) => onCameraPermissionDenied(s));
        return;
      }
      accept(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }), 'camera', replaceIndex);
    } catch {
      setState((s) => onPickerFailed(s));
    }
  }

  async function pickFromGallery(replaceIndex: number | null = null) {
    if (editDisabled || (replaceIndex === null && !addEnabled)) return;
    try {
      const limit = replaceIndex === null ? remainingPhotoSlots(state) : 1;
      accept(await ImagePicker.launchImageLibraryAsync({
        mediaTypes:              ['images'],
        quality:                 0.8,
        allowsMultipleSelection: limit > 1,
        selectionLimit:          limit,
      }), 'gallery', replaceIndex);
    } catch {
      setState((s) => onPickerFailed(s));
    }
  }

  function removeAt(index: number) {
    if (editDisabled) return;
    setPreviewIndex(null);
    setState((s) => onPhotoRemovedAt(s, index, generateId));
  }

  async function handleSubmit() {
    if (!task || !submitEnabled) return;
    // The ref is the correctness barrier against a double tap; the
    // disabled button is only the visual hint.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const working = beginCompletionSubmit(state, generateId);
      setState(working);
      if (working.phase !== 'submitting') return;
      const outcome = await finishCompletionSubmit(working, { id: task.id, householdId: task.householdId }, {
        onProgress: (p) => setState((s) => onSubmitProgress(s, p)),
      });
      setState(outcome.state);
      if (outcome.completed && variant === 'child') setSentTask(task);
      if (outcome.completed) onCompleted(outcome.submission);
    } finally {
      inFlightRef.current = false;
    }
  }

  function handleClose() {
    if (isSubmitting) return; // let the server answer first
    onClose();
  }

  const progressText = isSubmitting
    ? (state.progress && state.photos.length > 1
        ? formatCopy(copy.completionSheet.uploadingPhoto, { i: state.progress.current, n: state.progress.total })
        : state.photos.length === 1 ? copy.completionSheet.uploadingSingle : copy.completionSheet.submitting)
    : null;
  const previewPhoto = previewIndex !== null ? state.photos[previewIndex] : undefined;

  if (variant === 'child') {
    const shown = task ?? sentTask;
    const finishSent = () => {
      setSentTask(null);
      onSentDone?.();
    };
    return (
      <Modal
        visible={shown !== null}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={sentTask && !task ? finishSent : handleClose}>
        <ChildSubmitEvidence
          title={shown?.title ?? ''}
          missionCard={missionCard}
          notice={notice}
          state={state}
          sent={sentTask !== null && task === null}
          isSubmitting={isSubmitting}
          editDisabled={editDisabled}
          addEnabled={addEnabled}
          submitEnabled={submitEnabled}
          progressText={progressText}
          error={state.error ? { text: childFacingErrorCopy(state.error.kind), tone: isTerminal ? 'warning' : 'danger' } : null}
          onCamera={(i) => { void pickFromCamera(i); }}
          onGallery={(i) => { void pickFromGallery(i); }}
          onRemove={removeAt}
          onSubmit={() => { void handleSubmit(); }}
          onBack={handleClose}
          onSentDone={finishSent}
        />
      </Modal>
    );
  }

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        {/* Android edge-to-edge (forced on in Expo SDK 56) draws this
            window under the navigation bar; SafeAreaView adds that inset so
            the footer never sits under it. */}
        <SafeAreaView edges={['bottom']} style={[styles.card, { maxHeight: Math.round(windowHeight * sizes.sheetMaxRatio) }]}>
          <SheetHeader
            title={copy.completionSheet.title}
            subtitle={task?.title}
            onClose={handleClose}
            closeLabel={copy.completionSheet.close}
            closeDisabled={isSubmitting}
          />

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {notice ? <Banner tone="info" text={notice} /> : null}

            <View style={styles.photosHeader}>
              <Text style={styles.sectionLabel}>{copy.completionSheet.photosTitle}</Text>
              <Text style={styles.count} accessibilityLabel={photoCountLabel(state)}>
                {formatCopy(copy.completionSheet.photoCount, { n: state.photos.length, max: MAX_EVIDENCE_PHOTOS })}
              </Text>
            </View>
            <Text style={styles.hint}>{formatCopy(copy.completionSheet.addPhotosHint, { max: MAX_EVIDENCE_PHOTOS })}</Text>

            {state.photos.length > 0 && (
              <View style={styles.grid}>
                {state.photos.map((p, i) => (
                  <View key={`${p.previewUri}-${i}`} style={styles.thumbWrap}>
                    <Pressable
                      onPress={() => setPreviewIndex(i)}
                      style={styles.thumb}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={formatCopy(copy.completionSheet.previewPhotoA11y, { i: i + 1 })}>
                      <Image source={{ uri: p.previewUri }} style={styles.thumbImage} resizeMode="cover" resizeMethod="resize" />
                    </Pressable>
                    {!editDisabled && (
                      <Pressable
                        onPress={() => removeAt(i)}
                        hitSlop={10}
                        style={styles.removeBadge}
                        accessibilityRole="button"
                        accessibilityLabel={formatCopy(copy.completionSheet.removePhotoA11y, { i: i + 1 })}>
                        <Ionicons name="close" size={14} color={colors.textOnColor} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}

            {addEnabled ? (
              <View style={styles.row}>
                <AppButton label={copy.completionSheet.addCamera} icon="camera-outline" variant="secondary"
                  onPress={() => { void pickFromCamera(); }} style={styles.flex} />
                <AppButton label={copy.completionSheet.addGallery} icon="images-outline" variant="secondary"
                  onPress={() => { void pickFromGallery(); }} style={styles.flex} />
              </View>
            ) : state.photos.length >= MAX_EVIDENCE_PHOTOS && !editDisabled ? (
              <Text style={styles.hint}>{formatCopy(copy.completionSheet.maxReached, { max: MAX_EVIDENCE_PHOTOS })}</Text>
            ) : null}
          </ScrollView>

          {/* Footer outside the ScrollView: error, progress and Submit are
              always on screen, however many photos there are. */}
          <View style={styles.footer}>
            {state.error && !isSubmitting && (
              <Banner tone={isTerminal ? 'warning' : 'danger'} text={childFacingErrorCopy(state.error.kind)} />
            )}
            {progressText && (
              <View style={styles.progressRow} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <View style={styles.flex}>
                  <Text style={styles.progressText}>{progressText}</Text>
                  <Text style={styles.hint}>{copy.completionSheet.keepOpenHint}</Text>
                </View>
              </View>
            )}
            <AppButton
              label={copy.completionSheet.submit}
              onPress={() => { void handleSubmit(); }}
              disabled={!submitEnabled}
              busy={isSubmitting}
              busyLabel={progressText ?? copy.completionSheet.submitting}
            />
            <AppButton label={copy.completionSheet.cancel} variant="ghost" onPress={handleClose} disabled={isSubmitting} />
          </View>
        </SafeAreaView>
      </View>

      {/* Large preview of one selected photo, with replace / remove. */}
      <Modal visible={previewPhoto !== undefined} transparent={false} animationType="fade" onRequestClose={() => setPreviewIndex(null)}>
        <SafeAreaView style={styles.viewer}>
          <View style={styles.viewerTop}>
            <Text style={styles.viewerTitle}>
              {previewIndex !== null ? `${previewIndex + 1} / ${state.photos.length}` : ''}
            </Text>
            <IconButton icon="close" tone="onDark" accessibilityLabel={copy.completionSheet.close} onPress={() => setPreviewIndex(null)} />
          </View>
          {previewPhoto && <Image source={{ uri: previewPhoto.previewUri }} style={styles.viewerImage} resizeMode="contain" resizeMethod="resize" />}
          {previewIndex !== null && !editDisabled && (
            <View style={styles.viewerActions}>
              <AppButton label={copy.completionSheet.replaceWithCamera} icon="camera-outline" variant="secondary" compact style={styles.flex}
                onPress={() => { const i = previewIndex; setPreviewIndex(null); void pickFromCamera(i); }} />
              <AppButton label={copy.completionSheet.replaceWithGallery} icon="images-outline" variant="secondary" compact style={styles.flex}
                onPress={() => { const i = previewIndex; setPreviewIndex(null); void pickFromGallery(i); }} />
              <AppButton label={copy.completionSheet.remove} icon="trash-outline" variant="dangerOutline" compact style={styles.flex}
                onPress={() => removeAt(previewIndex)} />
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </Modal>
  );
}

function childFacingErrorCopy(kind: UiErrorKind): string {
  switch (kind) {
    case 'invalid_mime':             return copy.completionSheet.errorInvalidMime;
    case 'network_uncertain':        return copy.completionSheet.errorUncertain;
    case 'retryable_failed':         return copy.completionSheet.errorFailed;
    case 'unexpected_failure':       return copy.completionSheet.errorUnexpected;
    case 'photo_read_failed':        return copy.completionSheet.errorPhotoRead;
    case 'picker_failed':            return copy.completionSheet.errorPickerFailed;
    case 'not_open':                 return copy.completionSheet.errorNotOpen;
    case 'not_authorized':           return copy.completionSheet.errorNotAuthorized;
    case 'camera_permission_denied': return copy.completionSheet.errorCameraPermissionDenied;
    case 'attempt_rejected':         return copy.completionSheet.errorAttemptRejected;
    case 'too_many_photos':          return formatCopy(copy.completionSheet.errorTooManyPhotos, { max: MAX_EVIDENCE_PHOTOS });
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
  // flexShrink lets the body give up height to the footer once the sheet
  // reaches its maxHeight; flexGrow 0 keeps short content from stretching.
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
  photosHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  sectionLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  count: {
    ...typography.label,
    color: colors.textSecondary,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  thumbWrap: {
    width:  84,
    height: 84,
  },
  thumb: {
    width:           '100%',
    height:          '100%',
    borderRadius:    radius.md,
    overflow:        'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  thumbImage: {
    width:  '100%',
    height: '100%',
  },
  removeBadge: {
    position:        'absolute',
    top:             -6,
    right:           -6,
    width:           26,
    height:          26,
    borderRadius:    13,
    backgroundColor: colors.textPrimary,
    borderWidth:     2,
    borderColor:     colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },
  row: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },
  flex: {
    flex: 1,
  },
  progressRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.md,
    backgroundColor:   colors.primarySoft,
    borderRadius:      radius.md,
    padding:           spacing.md,
  },
  progressText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  viewer: {
    flex:            1,
    backgroundColor: colors.viewer,
  },
  viewerTop: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.sm,
  },
  viewerTitle: {
    ...typography.bodyStrong,
    color: colors.textOnColor,
  },
  viewerImage: {
    flex: 1,
  },
  viewerActions: {
    flexDirection: 'row',
    gap:           spacing.sm,
    padding:       spacing.lg,
  },
});

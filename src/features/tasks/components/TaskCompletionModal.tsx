import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { copy } from '@/content/copy';
import { submitTaskCompletionWithEvidence } from '@/features/tasks/requestTaskCompletionWithEvidence';
import { validateEvidenceMimeType } from '@/features/tasks/taskCompletionAttempt';
import { colors, radius, spacing, typography } from '@/theme';
import {
  INITIAL_UI_STATE,
  isTerminalPhase,
  onBeginNoPhotoSubmit,
  onBeginPhotoSubmit,
  onCameraPermissionDenied,
  onLocalPhotoReadFailed,
  onPhotoRemoved,
  onPhotoSelected,
  onPickerFailed,
  onSubmitInvalidMime,
  onSubmitRetryableFailed,
  onSubmitSuccess,
  onSubmitTerminalNotAuthorized,
  onSubmitTerminalNotOpen,
  onSubmitUncertain,
  onSubmitUnexpectedFailure,
  type TaskCompletionUiState,
  type UiErrorKind,
} from '@/features/tasks/components/taskCompletionUiState';

// expo-crypto randomUUID: native-backed, Web-platform fallback included.
// Same convention as RewardCard.tsx — kept inline in this native-only
// file so the Node-run tests of taskCompletionUiState never import it.
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
  onCompleted: () => void;
  onClose:     () => void;
};

export function TaskCompletionModal({ task, onCompleted, onClose }: Props) {
  const [state, setState] = useState<TaskCompletionUiState>(INITIAL_UI_STATE);
  const inFlightRef = useRef(false);

  // Reset UI state whenever the Modal closes/reopens. This guarantees a
  // fresh initial-state (no stale photo, no stale attempt) between tasks.
  React.useEffect(() => {
    if (task === null) setState(INITIAL_UI_STATE);
  }, [task]);

  const isSubmitting = state.phase === 'submitting';
  const isTerminal   = isTerminalPhase(state);
  const isOpen       = task !== null;
  // Any user-initiated action other than Cancel/Close is blocked when the
  // Modal is mid-submission OR has entered a terminal rejection
  // (not_open / not_authorized). Those terminal states are non-retryable
  // for the current logical attempt — Cancel/Close is the only way out.
  const actionsDisabled = isSubmitting || isTerminal;

  // Validate a picker result and transition. Returns true if a photo was
  // accepted; false if invalid MIME or user cancelled.
  function acceptPickerResult(result: ImagePicker.ImagePickerResult): boolean {
    if (result.canceled || !result.assets?.[0]) return false;
    const asset = result.assets[0];
    const mime  = asset.mimeType ?? '';
    if (validateEvidenceMimeType(mime) !== 'ok') {
      setState(s => onSubmitInvalidMime(s));
      return false;
    }
    setState(s => onPhotoSelected(s, { previewUri: asset.uri, mimeType: mime }, generateId));
    return true;
  }

  async function handleTakePhoto() {
    if (actionsDisabled) return;
    // Camera requires permission. Permission denial does NOT mint an
    // attempt — the state module records only the error. A thrown
    // exception from either call is caught below and routed through
    // onPickerFailed, which preserves any already-selected photo and the
    // existing logical attempt verbatim — no new ids are ever minted on
    // a picker failure.
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setState(s => onCameraPermissionDenied(s));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      acceptPickerResult(result);
    } catch {
      setState(s => onPickerFailed(s));
    }
  }

  async function handleChooseGallery() {
    if (actionsDisabled) return;
    // Gallery via the system image picker does NOT require an explicit
    // media-library permission request on supported modern platforms —
    // launchImageLibraryAsync handles the system picker directly. User
    // cancellation returns a `canceled: true` result which
    // acceptPickerResult treats as a no-op. A genuine thrown exception
    // (platform error, picker crash) is caught here and routed through
    // onPickerFailed; that path preserves any existing photo + attempt
    // (so a mid-replace cancel/exception keeps the original selection).
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      acceptPickerResult(result);
    } catch {
      setState(s => onPickerFailed(s));
    }
  }

  function handleRemovePhoto() {
    if (actionsDisabled) return;
    setState(s => onPhotoRemoved(s, generateId));
  }

  async function handleSubmit() {
    if (!task || actionsDisabled) return;
    // Defense-in-depth against double-submit: ref guard is set BEFORE any
    // async work, cleared only in the finally block. The UI disable alone
    // is a UX hint; this ref is the correctness barrier.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      // Begin transition: photo path reuses the existing photo-bearing
      // attempt (retry identity preserved); no-photo path lazily mints
      // a fresh no-photo attempt only if one doesn't exist yet.
      let working: TaskCompletionUiState;
      if (state.photo) {
        const begun = onBeginPhotoSubmit(state);
        if (!begun) return; // defensive: photo present but no attempt
        working = begun;
      } else {
        working = onBeginNoPhotoSubmit(state, generateId);
      }
      setState(working);
      if (!working.attempt) return; // defensive

      // Build the photo input lazily — bytes are not held in state. A
      // throw from any of fetch / blob() / arrayBuffer() is scoped to
      // this inner try so it maps to the LOCAL photo-read failure path
      // (preserve attempt + photo + ids, child can retry/replace/remove).
      let photoInput: { blob: Blob; mimeType: string } | null = null;
      if (state.photo) {
        try {
          const response   = await fetch(state.photo.previewUri);
          const sourceBlob = await response.blob();
          const bytes      = await sourceBlob.arrayBuffer();
          const blob       = new Blob([bytes], { type: state.photo.mimeType });
          photoInput       = { blob, mimeType: state.photo.mimeType };
        } catch {
          setState(s => onLocalPhotoReadFailed(s));
          return;
        }
      }

      const result = await submitTaskCompletionWithEvidence(
        working.attempt,
        { id: task.id, householdId: task.householdId },
        photoInput,
      );

      if (result.ok) {
        setState(onSubmitSuccess);
        onCompleted();
        return;
      }
      switch (result.reason) {
        case 'uncertain':      setState(s => onSubmitUncertain(s, result.state)); break;
        case 'failed':         setState(s => onSubmitRetryableFailed(s, result.state)); break;
        case 'not_open':       setState(s => onSubmitTerminalNotOpen(s)); break;
        case 'not_authorized': setState(s => onSubmitTerminalNotAuthorized(s)); break;
        case 'invalid_mime':   setState(s => onSubmitInvalidMime(s)); break;
      }
    } catch {
      // Catches anything the orchestration call threw instead of returning
      // a result shape (unexpected programmer error / unmapped reject).
      // Local photo-read errors are already handled by the inner try/catch
      // above and never reach here. Must NOT leave phase='submitting' —
      // onSubmitUnexpectedFailure drops back to a retryable state and
      // preserves attempt + ids verbatim.
      setState(s => onSubmitUnexpectedFailure(s));
    } finally {
      inFlightRef.current = false;
    }
  }

  function handleClose() {
    if (isSubmitting) return;
    onClose();
  }

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{copy.completionSheet.title}</Text>
          {task && <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>}
          <Text style={styles.hint}>{copy.completionSheet.optionalEvidenceHint}</Text>

          {state.photo ? (
            <View>
              <Image source={{ uri: state.photo.previewUri }} style={styles.preview} resizeMode="cover" />
              {/* Three replacement affordances: camera, gallery, or remove.
                  Each success through onPhotoSelected mints a NEW logical
                  attempt (new clientRequestId + new photoObjectId); each
                  cancel / exception preserves the current photo + attempt. */}
              <View style={styles.row}>
                <TouchableOpacity
                  onPress={handleTakePhoto}
                  disabled={actionsDisabled}
                  style={[styles.btn, styles.secondary, actionsDisabled && styles.disabled]}
                  accessibilityLabel={copy.completionSheet.takeAnother}>
                  <Text style={styles.btnTextSecondary}>{copy.completionSheet.takeAnother}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleChooseGallery}
                  disabled={actionsDisabled}
                  style={[styles.btn, styles.secondary, actionsDisabled && styles.disabled]}
                  accessibilityLabel={copy.completionSheet.chooseAnother}>
                  <Text style={styles.btnTextSecondary}>{copy.completionSheet.chooseAnother}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleRemovePhoto}
                  disabled={actionsDisabled}
                  style={[styles.btn, styles.secondary, actionsDisabled && styles.disabled]}
                  accessibilityLabel={copy.completionSheet.remove}>
                  <Text style={styles.btnTextSecondary}>{copy.completionSheet.remove}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.row}>
              <TouchableOpacity
                onPress={handleTakePhoto}
                disabled={actionsDisabled}
                style={[styles.btn, styles.secondary, actionsDisabled && styles.disabled]}
                accessibilityLabel={copy.completionSheet.takePhoto}>
                <Text style={styles.btnTextSecondary}>{copy.completionSheet.takePhoto}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleChooseGallery}
                disabled={actionsDisabled}
                style={[styles.btn, styles.secondary, actionsDisabled && styles.disabled]}
                accessibilityLabel={copy.completionSheet.chooseFromGallery}>
                <Text style={styles.btnTextSecondary}>{copy.completionSheet.chooseFromGallery}</Text>
              </TouchableOpacity>
            </View>
          )}

          {state.error && (
            <Text style={styles.error}>{childFacingErrorCopy(state.error.kind)}</Text>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={actionsDisabled}
            style={[styles.btn, styles.primary, actionsDisabled && styles.disabled]}
            accessibilityLabel={copy.completionSheet.submit}>
            {isSubmitting
              ? <ActivityIndicator color={colors.surface} />
              : <Text style={styles.btnTextPrimary}>{copy.completionSheet.submit}</Text>}
          </TouchableOpacity>

          {/* Cancel / Close is intentionally NOT gated on actionsDisabled —
              from a terminal (not_open / not_authorized) rejection, Cancel
              is the child's only way out of the Modal. It is only gated
              against isSubmitting so a close mid-flight doesn't orphan the
              in-flight orchestration call. */}
          <TouchableOpacity
            onPress={handleClose}
            disabled={isSubmitting}
            style={styles.cancelLink}
            accessibilityLabel={copy.completionSheet.cancel}>
            <Text style={styles.cancelLinkText}>{copy.completionSheet.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex:             1,
    backgroundColor:  'rgba(0,0,0,0.5)',
    justifyContent:   'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    padding:         spacing.xl,
    gap:             spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  taskTitle: {
    ...typography.body,
    color:        colors.textPrimary,
    fontWeight:   '600',
  },
  hint: {
    ...typography.caption,
    color:        colors.textSecondary,
  },
  preview: {
    width:        '100%',
    aspectRatio:  1,
    borderRadius: radius.md,
    backgroundColor: colors.borderSoft,
    marginVertical:  spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },
  btn: {
    flex:           1,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.borderSoft,
  },
  disabled: {
    opacity: 0.6,
  },
  btnTextPrimary: {
    ...typography.body,
    color:      colors.surface,
    fontWeight: '600',
  },
  btnTextSecondary: {
    ...typography.body,
    color:      colors.textPrimary,
    fontWeight: '500',
  },
  error: {
    ...typography.caption,
    color: colors.textMuted,
  },
  cancelLink: {
    alignItems: 'center',
    padding:    spacing.sm,
  },
  cancelLinkText: {
    ...typography.body,
    color: colors.textMuted,
  },
});

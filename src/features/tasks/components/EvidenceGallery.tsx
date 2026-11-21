import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@/components/ui/AppButton';
import { IconButton } from '@/components/ui/IconButton';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import {
  gallerySummary,
  initialGallery,
  loadOrder,
  onRetryFailed,
  onSlotFailed,
  onSlotReady,
  positionLabel,
  selectNext,
  selectPrevious,
  selectSlot,
  startGalleryLoads,
  type GalleryState,
} from '@/features/tasks/components/evidenceGalleryState';
import { evidenceSessionCache } from '@/features/tasks/evidenceSession';
import { colors, radius, sizes, spacing, typography } from '@/theme';

type Props = {
  submissionId: string;
  photoCount:   number;
  // Reviewer gating: every photo must be ready before a decision.
  onPhotoReady?:  (index: number, uri: string) => void;
  onPhotoFailed?: (index: number) => void;
  onRetry?:       () => void;
};

// Read-only evidence viewer shared by the reviewer modal and the child's
// "what you sent" view. Every photo comes through the session cache, i.e.
// the authorized Edge Function (submission id + index only — never a path
// or a URL from Storage). Photos load one at a time, the visible one first.
// Shown photos are pinned in the cache so eviction never removes a file
// that is on screen.
export function EvidenceGallery({ submissionId, photoCount, onPhotoReady, onPhotoFailed, onRetry }: Props) {
  const [state, setState] = useState<GalleryState>(() => initialGallery(photoCount));
  const [fullScreen, setFullScreen] = useState(false);
  const runRef   = useRef(0);
  const unpinRef = useRef<Array<() => void>>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  // (Re)start for a new submission. Late results of a previous one are
  // dropped by the run id.
  useEffect(() => {
    runRef.current += 1;
    const run = runRef.current;
    const initial = initialGallery(photoCount);
    setState(initial);
    void loadAll(run, initial);
    return () => {
      runRef.current += 1;
      for (const unpin of unpinRef.current) unpin();
      unpinRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, photoCount]);

  // All photos are requested in parallel (selected one first); each result
  // lands on its own slot. The session cache still dedupes identical
  // in-flight requests and serves repeats without the network.
  async function loadAll(run: number, from: GalleryState) {
    await startGalleryLoads(
      loadOrder(from),
      (index) => evidenceSessionCache.load(submissionId, index),
      (index, result) => {
        if (run !== runRef.current) return;
        if (result.ok) {
          unpinRef.current.push(evidenceSessionCache.pin(submissionId, index));
          setState((s) => onSlotReady(s, index, result.uri));
          onPhotoReady?.(index, result.uri);
        } else {
          setState((s) => onSlotFailed(s, index));
          onPhotoFailed?.(index);
        }
      },
    );
  }

  function retry() {
    const next = onRetryFailed(stateRef.current);
    setState(next);
    onRetry?.();
    void loadAll(runRef.current, next);
  }

  const summary  = gallerySummary(state);
  const current  = state.slots[state.selected];
  const multiple = state.slots.length > 1;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{formatCopy(copy.taskReview.photosLabel, { n: state.slots.length })}</Text>

      <View style={styles.stage}>
        {current?.status === 'ready' ? (
          <Pressable
            style={styles.fill}
            onPress={() => setFullScreen(true)}
            accessibilityRole="imagebutton"
            accessibilityLabel={formatCopy(copy.taskReview.openPhoto, { i: state.selected + 1 })}>
            <Image source={{ uri: current.uri }} style={styles.fill} resizeMode="contain" resizeMethod="resize" />
          </Pressable>
        ) : current?.status === 'failed' ? (
          <View style={styles.center}>
            <Ionicons name="image-outline" size={32} color={colors.textMuted} />
            <Text style={styles.muted}>{copy.taskReview.photoFailed}</Text>
          </View>
        ) : (
          <View style={styles.center} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>{copy.taskReview.loadingPhoto}</Text>
          </View>
        )}

        {multiple && (
          <>
            <View style={[styles.navLeft]}>
              <IconButton icon="chevron-back" tone="onDark" accessibilityLabel={copy.taskReview.previousPhoto}
                onPress={() => setState(selectPrevious)} disabled={state.selected === 0} />
            </View>
            <View style={[styles.navRight]}>
              <IconButton icon="chevron-forward" tone="onDark" accessibilityLabel={copy.taskReview.nextPhoto}
                onPress={() => setState(selectNext)} disabled={state.selected === state.slots.length - 1} />
            </View>
            <View style={styles.position} accessible accessibilityLabel={formatCopy(copy.taskReview.photoPosition, { i: state.selected + 1, n: state.slots.length })}>
              <Text style={styles.positionText}>{positionLabel(state)}</Text>
            </View>
          </>
        )}
      </View>

      {multiple && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {state.slots.map((slot, i) => (
            <Pressable
              key={i}
              onPress={() => setState((s) => selectSlot(s, i))}
              style={[styles.thumb, i === state.selected && styles.thumbSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: i === state.selected }}
              accessibilityLabel={formatCopy(copy.taskReview.photoPosition, { i: i + 1, n: state.slots.length })}>
              {slot.status === 'ready' ? (
                <Image source={{ uri: slot.uri }} style={styles.thumbImage} resizeMode="cover" resizeMethod="resize" />
              ) : slot.status === 'failed' ? (
                <Ionicons name="alert-circle" size={22} color={colors.danger} />
              ) : (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}

      {summary.failed > 0 && (
        <AppButton label={copy.taskReview.retry} variant="secondary" icon="refresh" onPress={retry} />
      )}

      <Modal visible={fullScreen && current?.status === 'ready'} transparent={false} animationType="fade"
        onRequestClose={() => setFullScreen(false)}>
        <SafeAreaView style={styles.viewer}>
          <View style={styles.viewerTop}>
            <Text style={styles.viewerPosition}>{multiple ? positionLabel(state) : ''}</Text>
            <IconButton icon="close" tone="onDark" accessibilityLabel={copy.taskReview.closePhoto} onPress={() => setFullScreen(false)} />
          </View>
          {current?.status === 'ready' && (
            <Image source={{ uri: current.uri }} style={styles.viewerImage} resizeMode="contain" resizeMethod="resize" />
          )}
          {multiple && (
            <View style={styles.viewerNav}>
              <IconButton icon="chevron-back" tone="onDark" accessibilityLabel={copy.taskReview.previousPhoto}
                onPress={() => setState(selectPrevious)} disabled={state.selected === 0} />
              <IconButton icon="chevron-forward" tone="onDark" accessibilityLabel={copy.taskReview.nextPhoto}
                onPress={() => setState(selectNext)} disabled={state.selected === state.slots.length - 1} />
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  stage: {
    width:           '100%',
    aspectRatio:     4 / 3,
    borderRadius:    radius.md,
    backgroundColor: colors.surfaceMuted,
    overflow:        'hidden',
  },
  fill: {
    width:  '100%',
    height: '100%',
  },
  center: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing.sm,
  },
  muted: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  navLeft: {
    position: 'absolute',
    left:     spacing.sm,
    top:      '50%',
    marginTop: -sizes.iconButton / 2,
  },
  navRight: {
    position: 'absolute',
    right:    spacing.sm,
    top:      '50%',
    marginTop: -sizes.iconButton / 2,
  },
  position: {
    position:          'absolute',
    bottom:            spacing.sm,
    alignSelf:         'center',
    backgroundColor:   colors.scrim,
    borderRadius:      radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical:   2,
  },
  positionText: {
    ...typography.label,
    color: colors.textOnColor,
  },
  thumbs: {
    gap: spacing.sm,
  },
  thumb: {
    width:           sizes.thumbnail,
    height:          sizes.thumbnail,
    borderRadius:    radius.sm,
    borderWidth:     2,
    borderColor:     'transparent',
    backgroundColor: colors.surfaceMuted,
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'hidden',
  },
  thumbSelected: {
    borderColor: colors.primary,
  },
  thumbImage: {
    width:  '100%',
    height: '100%',
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
  viewerPosition: {
    ...typography.bodyStrong,
    color: colors.textOnColor,
  },
  viewerImage: {
    flex: 1,
  },
  viewerNav: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical:   spacing.md,
  },
});

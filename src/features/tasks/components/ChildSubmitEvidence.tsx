import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import { childText, type ChildTypeToken } from '@/features/childHome/childType';
import { useRubikReady } from '@/features/startup/fontLoader';
import { colors, lockedSpacing as sp, radius, sizes } from '@/theme';
import {
  MAX_EVIDENCE_PHOTOS,
  photoCountLabel,
  type TaskCompletionUiState,
} from '@/features/tasks/components/taskCompletionUiState';
import { evidenceGridLayout } from '@/features/tasks/components/childEvidenceLayout';

// Slice 5C: the child's Submit Evidence screen (Board 20), a full-screen
// presentation of the existing completion flow. This file only renders:
// TaskCompletionModal owns the state, the pickers, the attempt identity
// and the submit sequence, and passes them in. Nothing here uploads,
// reads storage or changes the 0..5 photo rules. Sending with no photo
// stays possible.
//
// Board 20 states: A add photos (Camera / Gallery tiles), B thumbnails with
// add tiles until 5, C limit reached, D change or remove one photo (sheet),
// E sending (dimmed, status in words), F success ("Sent!").
// Remove and change marks are small visible marks inside 48dp hit areas.

export type ChildSubmitEvidenceProps = {
  title:         string;
  // The mission card under the header (art, title, due, Points), drawn by
  // the child screen that opened this, so this file never imports a screen.
  missionCard?:  React.ReactNode;
  notice?:       string | null;
  state:         TaskCompletionUiState;
  sent:          boolean;
  isSubmitting:  boolean;
  editDisabled:  boolean;
  addEnabled:    boolean;
  submitEnabled: boolean;
  progressText:  string | null;
  error:         { text: string; tone: 'warning' | 'danger' } | null;
  onCamera:      (replaceIndex: number | null) => void;
  onGallery:     (replaceIndex: number | null) => void;
  onRemove:      (index: number) => void;
  onSubmit:      () => void;
  onBack:        () => void;
  onSentDone:    () => void;
};

function useT() {
  const ready = useRubikReady();
  return (token: ChildTypeToken) => childText(token, ready);
}

export function ChildSubmitEvidence(props: ChildSubmitEvidenceProps) {
  const {
    title, missionCard, notice, state, sent, isSubmitting, editDisabled, addEnabled, submitEnabled,
    progressText, error, onCamera, onGallery, onRemove, onSubmit, onBack, onSentDone,
  } = props;
  const t = useT();
  const { width } = useWindowDimensions();
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const grid = evidenceGridLayout(width, sp.lg, sp.sm);
  const count = state.photos.length;
  const atMax = count >= MAX_EVIDENCE_PHOTOS;

  if (sent) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.sentBody} accessibilityLiveRegion="polite">
          <View style={styles.sentBubble}><Ionicons name="checkmark" size={64} color={colors.success} /></View>
          <Text style={[t('display'), styles.inkText, styles.center]} accessibilityRole="header">{copy.childEvidence.sentTitle}</Text>
          <Text style={[t('title'), styles.mutedText, styles.center]}>{copy.childEvidence.sentBody}</Text>
          <View style={styles.waitingPill}>
            <Ionicons name="time-outline" size={16} color={colors.waiting} />
            <Text style={[t('caption'), styles.waitingText]}>{copy.childEvidence.sentPill}</Text>
          </View>
        </View>
        <View style={styles.bar}>
          <AppButton label={copy.childEvidence.backToMissions} density="child" onPress={onSentDone} />
        </View>
      </SafeAreaView>
    );
  }

  const sheetPhoto = sheetIndex !== null ? state.photos[sheetIndex] : undefined;
  const closeSheetThen = (fn: (i: number) => void) => () => {
    const i = sheetIndex;
    setSheetIndex(null);
    if (i !== null) fn(i);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          disabled={isSubmitting}
          style={({ pressed }) => [styles.back, pressed && styles.pressed, isSubmitting && styles.dim]}
          accessibilityRole="button"
          accessibilityLabel={copy.missionDetails.back}
          accessibilityState={{ disabled: isSubmitting }}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={[t('h2'), styles.inkText, styles.flex]} accessibilityRole="header" numberOfLines={2}>{copy.childEvidence.title}</Text>
      </View>

      <ScrollView style={styles.flexFill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {missionCard ?? <Text style={[t('title'), styles.inkText]}>{title}</Text>}
        {notice ? <Banner tone="info" text={notice} /> : null}

        <View style={[styles.stack, isSubmitting && styles.sending]}>
          <View style={styles.row}>
            <Text style={[t('h2'), styles.inkText, styles.flex]}>{copy.childEvidence.photosTitle}</Text>
            <View style={styles.countPill} accessible accessibilityLabel={photoCountLabel(state)}>
              <Text style={[t('caption'), styles.indigoDeepText]}>
                {formatCopy(copy.childEvidence.photoCount, { n: count, max: MAX_EVIDENCE_PHOTOS })}
              </Text>
            </View>
          </View>

          {count === 0 ? (
            <View style={styles.row}>
              <AddTile big label={copy.completionSheet.addCamera} icon="camera-outline" disabled={!addEnabled} onPress={() => onCamera(null)} />
              <AddTile big label={copy.completionSheet.addGallery} icon="images-outline" disabled={!addEnabled} onPress={() => onGallery(null)} />
            </View>
          ) : (
            <View style={[styles.grid, { gap: grid.gap }]}>
              {state.photos.map((p, i) => (
                <View key={`${p.previewUri}-${i}`} style={{ width: grid.tile, height: grid.tile }}>
                  <Pressable
                    onPress={() => setSheetIndex(i)}
                    disabled={editDisabled}
                    style={styles.thumb}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={formatCopy(copy.childEvidence.photoSheetTitle, { i: i + 1 })}>
                    <Image source={{ uri: p.previewUri }} style={styles.thumbImage} resizeMode="cover" resizeMethod="resize" />
                  </Pressable>
                  {!editDisabled ? (
                    <Pressable
                      onPress={() => onRemove(i)}
                      style={styles.removeHit}
                      accessibilityRole="button"
                      accessibilityLabel={formatCopy(copy.completionSheet.removePhotoA11y, { i: i + 1 })}>
                      <View style={styles.removeMark}><Ionicons name="close" size={14} color={colors.textOnColor} /></View>
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {addEnabled ? (
                <>
                  <View style={{ width: grid.tile, height: grid.tile }}>
                    <AddTile label={copy.completionSheet.addCamera} icon="camera-outline" onPress={() => onCamera(null)} />
                  </View>
                  <View style={{ width: grid.tile, height: grid.tile }}>
                    <AddTile label={copy.completionSheet.addGallery} icon="images-outline" onPress={() => onGallery(null)} />
                  </View>
                </>
              ) : null}
            </View>
          )}

          {atMax && !editDisabled ? (
            <Banner tone="info" text={formatCopy(copy.childEvidence.maxReached, { max: MAX_EVIDENCE_PHOTOS })} />
          ) : count === 0 ? (
            <Text style={[t('caption'), styles.mutedText]}>{formatCopy(copy.childEvidence.hint, { max: MAX_EVIDENCE_PHOTOS })}</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Pinned: errors, progress and Send stay on screen however many
          photos there are. */}
      <View style={styles.bar}>
        {error && !isSubmitting ? <Banner tone={error.tone} text={error.text} /> : null}
        {isSubmitting ? (
          <View style={styles.progress} accessibilityLiveRegion="polite">
            <Ionicons name="time-outline" size={20} color={colors.indigoDeep} />
            <View style={styles.flex}>
              <Text style={[t('title'), styles.inkText]}>{count > 0 ? copy.childEvidence.sendingPhotos : copy.childEvidence.sending}</Text>
              {progressText ? <Text style={[t('caption'), styles.mutedText]}>{progressText}</Text> : null}
              <Text style={[t('caption'), styles.mutedText]}>{copy.completionSheet.keepOpenHint}</Text>
            </View>
          </View>
        ) : null}
        <AppButton
          label={copy.childEvidence.submit}
          density="child"
          onPress={onSubmit}
          disabled={!submitEnabled}
          busy={isSubmitting}
          busyLabel={progressText ?? copy.childEvidence.sending}
        />
      </View>

      {/* Board 20 D: change or remove one photo. Remove is the quiet last
          choice, never the dominant one. */}
      <Modal visible={sheetPhoto !== undefined} transparent animationType="slide" onRequestClose={() => setSheetIndex(null)}>
        <View style={styles.scrim}>
          <Pressable style={styles.flexFill} onPress={() => setSheetIndex(null)} accessibilityLabel={copy.childEvidence.cancel} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.grab} />
            <Text style={[t('h2'), styles.inkText]} accessibilityRole="header">
              {sheetIndex !== null ? formatCopy(copy.childEvidence.photoSheetTitle, { i: sheetIndex + 1 }) : ''}
            </Text>
            {sheetPhoto ? <Image source={{ uri: sheetPhoto.previewUri }} style={styles.sheetPreview} resizeMode="contain" resizeMethod="resize" /> : null}
            <AppButton label={copy.childEvidence.changeCamera} icon="camera-outline" variant="secondary" density="child" onPress={closeSheetThen(onCamera)} />
            <AppButton label={copy.childEvidence.changeGallery} icon="images-outline" variant="secondary" density="child" onPress={closeSheetThen(onGallery)} />
            <AppButton label={copy.childEvidence.removePhoto} icon="trash-outline" variant="dangerOutline" density="child" onPress={closeSheetThen(onRemove)} />
            <AppButton label={copy.childEvidence.cancel} variant="ghost" density="child" onPress={() => setSheetIndex(null)} />
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AddTile({ label, icon, onPress, disabled = false, big = false }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; big?: boolean;
}) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.tile, big && styles.tileBig, pressed && styles.tilePressed, disabled && styles.dim]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}>
      <Ionicons name={icon} size={big ? 28 : 24} color={colors.indigo} />
      <Text style={[t('title'), styles.indigoDeepText, styles.center]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: colors.indigoTint },
  flex:     { flex: 1, minWidth: 0 },
  flexFill: { flex: 1 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
  stack:    { gap: sp.md },
  center:   { textAlign: 'center' },
  pressed:  { opacity: 0.7 },
  dim:      { opacity: 0.5 },
  sending:  { opacity: 0.55 },

  inkText:        { color: colors.ink },
  mutedText:      { color: colors.textSecondary },
  indigoDeepText: { color: colors.indigoDeep },
  waitingText:    { color: colors.waiting },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               sp.sm,
    paddingHorizontal: sp.sm,
    paddingVertical:   sp.xs,
  },
  back: {
    width:          sizes.tapTarget,
    height:         sizes.tapTarget,
    borderRadius:   sizes.tapTarget / 2,
    alignItems:     'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: sp.lg, paddingBottom: sp.lg, gap: sp.md },

  countPill: {
    minHeight:         28,
    paddingHorizontal: sp.sm + 2,
    borderRadius:      radius.pill,
    backgroundColor:   colors.surface,
    justifyContent:    'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  thumb: {
    width:           '100%',
    height:          '100%',
    borderRadius:    radius.control,
    overflow:        'hidden',
    backgroundColor: colors.surface,
  },
  thumbImage: { width: '100%', height: '100%' },
  // 48dp hit area in the thumbnail's corner around a 28dp visible mark.
  removeHit: {
    position:       'absolute',
    top:            0,
    right:          0,
    width:          sizes.tapTarget,
    height:         sizes.tapTarget,
    alignItems:     'center',
    justifyContent: 'center',
  },
  removeMark: {
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: colors.ink,
    borderWidth:     2,
    borderColor:     colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },
  tile: {
    flex:            1,
    minHeight:       sizes.tapTarget,
    borderRadius:    radius.control,
    borderWidth:     2,
    borderStyle:     'dashed',
    borderColor:     colors.indigo,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             sp.xs,
    padding:         sp.xs,
  },
  tileBig:     { minHeight: 96, borderRadius: radius.childCard },
  tilePressed: { backgroundColor: colors.indigoTint },

  bar: {
    gap:               sp.sm,
    paddingHorizontal: sp.lg,
    paddingTop:        sp.sm,
    paddingBottom:     sp.md,
    backgroundColor:   colors.surface,
    borderTopWidth:    1,
    borderTopColor:    colors.border,
  },
  progress: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             sp.md,
    padding:         sp.md,
    borderRadius:    radius.control,
    backgroundColor: colors.indigoTint,
  },

  sentBody:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: sp.md, paddingHorizontal: sp.lg },
  sentBubble: {
    width:           110,
    height:          110,
    borderRadius:    55,
    backgroundColor: colors.successSoft,
    alignItems:      'center',
    justifyContent:  'center',
  },
  waitingPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               sp.xs,
    minHeight:         28,
    paddingHorizontal: sp.sm + 2,
    borderRadius:      radius.pill,
    backgroundColor:   colors.waitingSoft,
  },

  scrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding:              sp.lg,
    gap:                  sp.sm,
  },
  grab: {
    alignSelf:       'center',
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: colors.border,
  },
  sheetPreview: { width: '100%', height: 160, borderRadius: radius.control, backgroundColor: colors.surfaceMuted },
});

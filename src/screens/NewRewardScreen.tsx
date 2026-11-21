import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { TextField, fieldStyles } from '@/components/ui/TextField';
import { copy } from '@/content/copy';
import { formatCopy } from '@/content/formatCopy';
import {
  COST_PRESETS,
  canDecrement,
  canIncrement,
  decrementCost,
  incrementCost,
  selectedPreset,
  validateCreateReward,
  type CostError,
} from '@/features/adultRewards/createRewardForm';
import { overlapForKeyboardTop } from '@/features/adultRewards/keyboardOverlap';
import { subscribeKeyboardTop } from '@/features/adultRewards/keyboardTopSource';
import { createReward } from '@/features/rewards/createReward';
import { createSingleFlight } from '@/features/tasks/createTaskFormState';
import { useAdultText, useBoldCaption } from '@/screens/AdultHomeScreen';
import { selectCanCreateRewards, selectCurrentHousehold, selectCurrentMemberRole, selectCurrentUser } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, lockedSpacing as sp, radius, sizes } from '@/theme';

// Slice 6C: Create Reward (Board 11, adult tokens from Board 14). A root
// stack route above the tabs, opened from Adult Rewards "New reward" and
// Adult Home "New reward".
//   - Exactly the real fields: Reward name (required), Description
//     (optional), Points cost (required). createRewardForm.ts holds the
//     rules; createReward() (unchanged) does the permission check, the
//     insert and the store update.
//   - Points cost: − value + (the value is the editable number field) and
//     quick chips 50 · 80 · 120.
//   - "Create reward" is pinned at the bottom and rides above the
//     keyboard (useKeyboardOverlap, below). One tap = one reward: a single-flight guard drops a second
//     tap and the button is busy while the insert runs. The backend has no
//     idempotency key for rewards, so this guard is the protection.
//   - On success the screen closes (onDone) and the new reward is already
//     in the store, so Adult Rewards shows it once.
// No illustration picker, edit, archive or category (Board 11: future).
// Gated by rewards.create; the server's RLS stays authoritative.
// Android gate vc19 fix: KeyboardAvoidingView measured its frame relative
// to its parent (below the native-stack header), so it under-shrank by the
// header height and the keyboard covered "Create reward". Instead, measure
// where the form frame really ends on screen when the keyboard opens and
// pad the bottom by the true overlap. Works whether or not the OS also
// resizes the window (then the overlap is simply 0).
// vc21: the frame is measured with measure()'s pageY, which is in the same
// screen space as the keyboard's screenY (see keyboardOverlap.ts for why
// measureInWindow was a status-bar height short).
// vc23: recomputed on EVERY keyboard geometry change (subscribeKeyboardTop),
// not only when the keyboard opens/closes — switching Name/Description
// (text keyboard) <-> Points (number pad) keeps the keyboard up but changes
// its height. The frame's own paddingBottom does not change its measured
// height, so the padding is always derived fresh (no drift).
function useKeyboardOverlap(frame: React.RefObject<View | null>): number {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    let alive = true;
    const unsubscribe = subscribeKeyboardTop((keyboardTop) => {
      if (keyboardTop === null) { setOverlap(0); return; }
      frame.current?.measure((_x, _y, _w, h, _pageX, pageY) => {
        if (alive) setOverlap(overlapForKeyboardTop({ frameTop: pageY, frameHeight: h }, keyboardTop));
      });
    });
    return () => { alive = false; unsubscribe(); };
  }, [frame]);
  return overlap;
}

export function NewRewardScreen({ onDone }: { onDone: () => void }) {
  const t         = useAdultText();
  const boldCaption = useBoldCaption();
  const household = useAppStore(selectCurrentHousehold);
  const user      = useAppStore(selectCurrentUser);
  const role      = useAppStore(selectCurrentMemberRole);
  const canCreate = useAppStore(selectCanCreateRewards);

  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [costText, setCostText]       = useState('');
  const [nameError, setNameError]     = useState(false);
  const [costErr, setCostErr]         = useState<CostError | null>(null);
  const [failed, setFailed]           = useState(false);
  const [busy, setBusy]               = useState(false);
  const singleFlight = useRef(createSingleFlight()).current;
  const frameRef = useRef<View>(null);
  const keyboardOverlap = useKeyboardOverlap(frameRef);

  function setCost(next: string) {
    setCostText(next);
    if (costErr) setCostErr(null);
  }

  async function doCreate() {
    if (busy || !household || !user) return;
    const v = validateCreateReward(name, costText);
    setNameError(v.nameError);
    setCostErr(v.cost);
    if (v.nameError || v.points === null) return;
    setFailed(false);
    setBusy(true);
    let ok = false;
    try {
      const result = await createReward({
        householdId:        household.id,
        title:              name.trim(),
        description:        description.trim() || undefined,
        requiredPoints:     v.points,
        createdByProfileId: user.id,
        role,
      });
      ok = result.ok;
    } catch {
      ok = false;
    } finally {
      setBusy(false);
    }
    if (ok) onDone();
    else setFailed(true);
  }

  if (!canCreate || !household || !user) {
    return (
      <Screen style={styles.screen} edges={['left', 'right', 'bottom']}>
        <View style={styles.content}>
          <Text style={[t('body'), styles.muted]}>{copy.adultRewards.create.notAllowed}</Text>
        </View>
      </Screen>
    );
  }

  const preset = selectedPreset(costText);
  const decOk = canDecrement(costText) && !busy;
  const incOk = canIncrement(costText) && !busy;

  return (
    <Screen style={styles.screen} edges={['left', 'right', 'bottom']}>
      <View ref={frameRef} style={[styles.flex, { paddingBottom: keyboardOverlap }]}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            density="adult"
            label={copy.adultRewards.create.nameLabel}
            value={name}
            onChangeText={(text) => { setName(text); if (nameError) setNameError(false); setFailed(false); }}
            placeholder={copy.adultRewards.create.namePlaceholder}
            editable={!busy}
            returnKeyType="next"
            error={nameError ? copy.adultRewards.create.nameRequired : null}
          />
          <TextField
            density="adult"
            label={copy.adultRewards.create.descriptionLabel}
            value={description}
            onChangeText={setDescription}
            placeholder={copy.adultRewards.create.descriptionPlaceholder}
            editable={!busy}
            multiline
          />

          <View style={styles.group}>
            <Text style={[boldCaption, styles.muted]}>{copy.adultRewards.create.costLabel}</Text>
            <View style={[styles.stepper, costErr ? styles.stepperError : null]}>
              <Pressable
                onPress={() => setCost(decrementCost(costText))}
                disabled={!decOk}
                accessibilityRole="button"
                accessibilityLabel={copy.adultRewards.create.decrease}
                accessibilityState={{ disabled: !decOk }}
                style={({ pressed }) => [styles.stepButton, pressed && styles.stepPressed, !decOk && styles.dim]}>
                <Ionicons name="remove" size={22} color={colors.indigo} />
              </Pressable>
              {/* multiline (vc22): an Android single-line field with centred
                  text reports itself horizontally scrollable, so it kept
                  every drag that started on it (the form would not scroll
                  to the chips with the keyboard open) and its centred
                  placeholder vanished on focus. A multiline field wraps
                  instead; one short line cannot scroll, so drags pass to
                  the ScrollView. Number pad has no Enter; parseCost
                  rejects anything but digits. */}
              <TextInput
                value={costText}
                onChangeText={setCost}
                multiline
                textAlignVertical="center"
                keyboardType="number-pad"
                placeholder={copy.adultRewards.create.costPlaceholder}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={copy.adultRewards.create.costA11y}
                editable={!busy}
                maxLength={10}
                style={[t('h2'), styles.costInput]}
              />
              <Pressable
                onPress={() => setCost(incrementCost(costText))}
                disabled={!incOk}
                accessibilityRole="button"
                accessibilityLabel={copy.adultRewards.create.increase}
                accessibilityState={{ disabled: !incOk }}
                style={({ pressed }) => [styles.stepButton, pressed && styles.stepPressed, !incOk && styles.dim]}>
                <Ionicons name="add" size={22} color={colors.indigo} />
              </Pressable>
            </View>
            <View style={styles.chips} accessibilityLabel={copy.adultRewards.create.quickCostsA11y}>
              {COST_PRESETS.map((n) => {
                const on = preset === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setCost(String(n))}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={formatCopy(copy.adultRewards.create.presetA11y, { n })}
                    accessibilityState={{ selected: on, disabled: busy }}
                    aria-selected={on}
                    style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[t('title'), on ? styles.onIndigo : styles.ink]}>{String(n)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {costErr ? (
              <Text style={[t('caption'), styles.error]} accessibilityLiveRegion="polite">{copy.adultRewards.create.costErrors[costErr]}</Text>
            ) : null}
          </View>

          {failed ? <Banner tone="danger" text={copy.adultRewards.create.error} /> : null}
        </ScrollView>

        <View style={styles.bar}>
          <AppButton
            label={copy.adultRewards.create.button}
            density="adult"
            onPress={() => { void singleFlight(() => doCreate()); }}
            busy={busy}
            busyLabel={copy.adultRewards.create.creating}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    backgroundColor:   colors.adultGround,
  },
  flex: { flex: 1 },
  content: {
    padding: sp.lg,
    gap:     sp.md,
  },
  ink: { color: colors.ink },
  muted: { color: colors.textSecondary },
  onIndigo: { color: colors.textOnColor },
  dim: { opacity: 0.4 },
  group: { gap: sp.xs },
  stepper: {
    flexDirection:   'row',
    alignItems:      'center',
    minHeight:       52,
    borderRadius:    radius.field,
    borderWidth:     1.5,
    borderColor:     colors.border,
    backgroundColor: colors.surface,
    overflow:        'hidden',
  },
  stepperError: { borderColor: colors.danger },
  stepButton: {
    width:          52,
    minHeight:      52,
    alignItems:     'center',
    justifyContent: 'center',
  },
  stepPressed: { backgroundColor: colors.indigoTint },
  // The shared field style, borderless inside the stepper's own frame.
  costInput: {
    ...fieldStyles.input,
    ...fieldStyles.locked,
    borderWidth:     0,
    borderRadius:    0,
    // Shrinks with a larger font so both step buttons stay on screen.
    flex:            1,
    minWidth:        0,
    width:           0,
    minHeight:       52,
    textAlign:       'center',
    color:           colors.ink,
    paddingVertical: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           sp.sm,
    marginTop:     sp.xs,
  },
  chip: {
    minHeight:         sizes.tapTarget,
    minWidth:          64,
    paddingHorizontal: sp.lg,
    borderRadius:      radius.pill,
    borderWidth:       1.5,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
    alignItems:        'center',
    justifyContent:    'center',
  },
  chipOn: {
    backgroundColor: colors.indigo,
    borderColor:     colors.indigo,
  },
  error: { color: colors.danger },
  bar: {
    paddingHorizontal: sp.lg,
    paddingTop:        sp.sm,
    paddingBottom:     sp.md,
    backgroundColor:   colors.surface,
    borderTopWidth:    1,
    borderTopColor:    colors.border,
  },
});

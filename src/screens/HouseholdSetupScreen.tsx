import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { FormScreen } from '@/components/ui/FormScreen';
import { TextField } from '@/components/ui/TextField';
import { createHouseholdWithOwner, redeemHouseholdInvite } from '@/lib/repositories';
import { selectAuthUser, selectCurrentUser } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, radius, shadows, typography } from '@/theme';
import { copy } from '@/content/copy';

type Mode = 'create' | 'join';

/**
 * Recovery UX for authenticated users who have a profile but no household.
 *
 * Two modes, toggled by tab buttons:
 *   create — create a new household (T1.5.3 behavior, unchanged)
 *   join   — join an existing household via an invite code, through the
 *            redeem_household_invite RPC (T1.9.1 invite system — this
 *            screen previously used household.id as the join code, per
 *            that migration's own comment marking it a stopgap pending a
 *            "dedicated invite system," which now exists and is wired here).
 *
 * Architecture boundaries (both modes):
 *   - Reads auth user id from store (selectAuthUser).
 *   - Calls repository layer only.
 *   - On success: calls requestAppDataHydrationRetry() — trigger only.
 *     AppDataBootstrap re-runs the full pipeline; this screen does not.
 *   - Does NOT manually write household/tasks/rewards/members into Zustand.
 *   - Does NOT navigate imperatively.
 *   - Does NOT call Supabase directly.
 *   - Does NOT call resetAppState or clear auth state.
 *   - isSubmitting guard prevents duplicate submissions in both modes.
 */
export function HouseholdSetupScreen() {
  const authUser                     = useAppStore(selectAuthUser);
  // Reused as p_display_name for redeem_household_invite — the profile
  // already exists in this screen's state (hasNoHousehold, not
  // missing_profile), so the RPC's ON CONFLICT DO NOTHING leaves it
  // untouched; this is only ever the value actually sent.
  const currentUser                  = useAppStore(selectCurrentUser);
  const requestAppDataHydrationRetry = useAppStore((s) => s.requestAppDataHydrationRetry);

  const [mode, setMode] = useState<Mode>('create');

  // Create mode state
  const [householdName, setHouseholdName]         = useState('');
  const [createSubmitting, setCreateSubmitting]   = useState(false);
  const [createValidation, setCreateValidation]   = useState<string | null>(null);
  const [createError, setCreateError]             = useState<string | null>(null);

  // Join mode state
  const [householdCode, setHouseholdCode]         = useState('');
  const [joinSubmitting, setJoinSubmitting]       = useState(false);
  const [joinValidation, setJoinValidation]       = useState<string | null>(null);
  const [joinError, setJoinError]                 = useState<string | null>(null);

  function switchMode(next: Mode) {
    // Clear local form state when switching tabs so errors don't bleed across.
    setMode(next);
    setCreateValidation(null);
    setCreateError(null);
    setJoinValidation(null);
    setJoinError(null);
  }

  // ── Create handler ──────────────────────────────────────────────────────────

  async function handleCreate() {
    if (createSubmitting) return;

    const trimmed = householdName.trim();
    if (!trimmed) {
      setCreateValidation(copy.householdSetup.validationEmpty);
      return;
    }
    if (!authUser?.id) {
      setCreateError(copy.householdSetup.error);
      return;
    }

    setCreateValidation(null);
    setCreateError(null);
    setCreateSubmitting(true);

    try {
      const result = await createHouseholdWithOwner({
        name:           trimmed,
        ownerProfileId: authUser.id,
      });

      if (result.error) {
        setCreateError(copy.householdSetup.error);
        return;
      }

      requestAppDataHydrationRetry();
    } catch {
      setCreateError(copy.householdSetup.error);
    } finally {
      setCreateSubmitting(false);
    }
  }

  // ── Join handler ────────────────────────────────────────────────────────────

  async function handleJoin() {
    if (joinSubmitting) return;

    // Invite codes are generated uppercase-only (CODE_ALPHABET in
    // householdInvites.ts); redemption does an exact match, so normalize
    // here rather than silently failing on a lowercase paste/type.
    const trimmed = householdCode.trim().toUpperCase();
    if (!trimmed) {
      setJoinValidation(copy.householdJoin.validationEmpty);
      return;
    }
    if (!authUser?.id || !currentUser?.name) {
      setJoinError(copy.householdJoin.error);
      return;
    }

    setJoinValidation(null);
    setJoinError(null);
    setJoinSubmitting(true);

    try {
      const result = await redeemHouseholdInvite({
        code:        trimmed,
        displayName: currentUser.name,
        avatarEmoji: currentUser.avatarEmoji ?? null,
      });

      if (result.error) {
        setJoinError(copy.householdJoin.error);
        return;
      }

      requestAppDataHydrationRetry();
    } catch {
      setJoinError(copy.householdJoin.error);
    } finally {
      setJoinSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isSubmitting = createSubmitting || joinSubmitting;

  const isCreate = mode === 'create';

  return (
    <FormScreen
      title={isCreate ? copy.householdSetup.title : copy.householdJoin.title}
      subtitle={isCreate ? copy.householdSetup.body : copy.householdJoin.body}
      hero={<Text style={styles.hero}>🏡</Text>}
    >
      {/* Create / Join switch */}
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['create', 'join'] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.tab, mode === m && styles.tabActive]}
            onPress={() => switchMode(m)}
            disabled={isSubmitting}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m, disabled: isSubmitting }}
          >
            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
              {m === 'create' ? copy.householdJoin.tabCreate : copy.householdJoin.tabJoin}
            </Text>
          </Pressable>
        ))}
      </View>

      {isCreate ? (
        <>
          <TextField
            label={copy.householdSetup.fieldLabel}
            value={householdName}
            onChangeText={(text: string) => {
              setHouseholdName(text);
              if (createValidation) setCreateValidation(null);
            }}
            placeholder={copy.householdSetup.fieldPlaceholder}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            editable={!createSubmitting}
            error={createValidation}
          />
          {createError ? <Banner tone="danger" text={createError} /> : null}
          <AppButton
            label={copy.householdSetup.button}
            onPress={() => { void handleCreate(); }}
            busy={createSubmitting}
            busyLabel={copy.householdSetup.buttonLoading}
          />
        </>
      ) : (
        <>
          <TextField
            label={copy.householdJoin.fieldLabel}
            value={householdCode}
            onChangeText={(text: string) => {
              setHouseholdCode(text);
              if (joinValidation) setJoinValidation(null);
            }}
            placeholder={copy.householdJoin.fieldPlaceholder}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleJoin}
            editable={!joinSubmitting}
            error={joinValidation}
          />
          {joinError ? <Banner tone="danger" text={joinError} /> : null}
          <AppButton
            label={copy.householdJoin.button}
            onPress={() => { void handleJoin(); }}
            busy={joinSubmitting}
            busyLabel={copy.householdJoin.buttonLoading}
          />
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    fontSize: 48,
  },
  tabs: {
    flexDirection:   'row',
    borderRadius:    radius.md,
    backgroundColor: colors.surfaceMuted,
    padding:         4,
    gap:             4,
  },
  tab: {
    flex:           1,
    minHeight:      44,
    borderRadius:   radius.sm,
    alignItems:     'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  tabText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
});

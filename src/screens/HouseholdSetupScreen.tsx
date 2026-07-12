import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { createHouseholdWithOwner, redeemHouseholdInvite } from '@/lib/repositories';
import { selectAuthUser, selectCurrentUser } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, spacing, typography } from '@/theme';
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

  return (
    <View style={styles.container}>
      <View style={styles.content}>

        {/* Tab toggle */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'create' && styles.tabActive]}
            onPress={() => switchMode('create')}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, mode === 'create' && styles.tabTextActive]}>
              {copy.householdJoin.tabCreate}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'join' && styles.tabActive]}
            onPress={() => switchMode('join')}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, mode === 'join' && styles.tabTextActive]}>
              {copy.householdJoin.tabJoin}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Create mode */}
        {mode === 'create' && (
          <>
            <Text style={styles.title}>{copy.householdSetup.title}</Text>
            <Text style={styles.body}>{copy.householdSetup.body}</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{copy.householdSetup.fieldLabel}</Text>
              <TextInput
                style={[styles.input, createValidation ? styles.inputError : null]}
                value={householdName}
                onChangeText={(text: string) => {
                  setHouseholdName(text);
                  if (createValidation) setCreateValidation(null);
                }}
                placeholder={copy.householdSetup.fieldPlaceholder}
                placeholderTextColor={colors.textMuted}
                autoFocus
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                editable={!createSubmitting}
              />
              {createValidation ? (
                <Text style={styles.validationText}>{createValidation}</Text>
              ) : null}
            </View>

            {createError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{createError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, createSubmitting && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={createSubmitting}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>
                {createSubmitting
                  ? copy.householdSetup.buttonLoading
                  : copy.householdSetup.button}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Join mode */}
        {mode === 'join' && (
          <>
            <Text style={styles.title}>{copy.householdJoin.title}</Text>
            <Text style={styles.body}>{copy.householdJoin.body}</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{copy.householdJoin.fieldLabel}</Text>
              <TextInput
                style={[styles.input, joinValidation ? styles.inputError : null]}
                value={householdCode}
                onChangeText={(text: string) => {
                  setHouseholdCode(text);
                  if (joinValidation) setJoinValidation(null);
                }}
                placeholder={copy.householdJoin.fieldPlaceholder}
                placeholderTextColor={colors.textMuted}
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleJoin}
                editable={!joinSubmitting}
              />
              {joinValidation ? (
                <Text style={styles.validationText}>{joinValidation}</Text>
              ) : null}
            </View>

            {joinError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{joinError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, joinSubmitting && styles.buttonDisabled]}
              onPress={handleJoin}
              disabled={joinSubmitting}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>
                {joinSubmitting
                  ? copy.householdJoin.buttonLoading
                  : copy.householdJoin.button}
              </Text>
            </TouchableOpacity>
          </>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    backgroundColor:   colors.background,
    justifyContent:    'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    gap: spacing.md,
  },
  tabs: {
    flexDirection:  'row',
    borderRadius:   10,
    backgroundColor: colors.surface,
    padding:        4,
    marginBottom:   spacing.sm,
  },
  tab: {
    flex:            1,
    paddingVertical: spacing.sm,
    alignItems:      'center',
    borderRadius:    8,
  },
  tabActive: {
    backgroundColor: colors.background,
  },
  tabText: {
    ...typography.caption,
    color:      colors.textMuted,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  title: {
    ...typography.heading,
    color:        colors.textPrimary,
    marginBottom: spacing.xs,
  },
  body: {
    ...typography.body,
    color:        colors.textSecondary,
    marginBottom: spacing.sm,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color:      colors.textMuted,
    fontWeight: '600',
  },
  input: {
    ...typography.body,
    color:             colors.textPrimary,
    backgroundColor:   colors.surface,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
    borderRadius:      10,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
  },
  inputError: {
    borderColor: '#B91C1C',
  },
  validationText: {
    ...typography.caption,
    color: '#B91C1C',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius:    8,
    padding:         spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: '#B91C1C',
  },
  button: {
    backgroundColor: colors.primary ?? colors.textPrimary,
    borderRadius:    10,
    paddingVertical: spacing.md,
    alignItems:      'center',
    marginTop:       spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    color:      '#FFFFFF',
    fontWeight: '600',
  },
});

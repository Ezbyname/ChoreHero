import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { ensureProfileExists } from '@/lib/repositories';
import { selectAuthUser } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, spacing, typography } from '@/theme';
import { copy } from '@/content/copy';

// Small, fixed set — not a full emoji picker library. Optional: a member can
// create their profile with no avatar selected and get the initials fallback
// (see FamilyAvatar) until they set one.
const AVATAR_EMOJI_OPTIONS = ['😀', '😎', '🦸', '🐶', '🐱', '🦖', '🐸', '🌟', '⚽', '🎨', '🚀', '🌈'];

/**
 * Recovery UX for authenticated users who have no ChoreHero profile yet.
 *
 * Architecture boundaries:
 *   - Reads auth user id from store (selectAuthUser).
 *   - Calls ensureProfileExists (repository layer only — idempotent upsert).
 *   - On success: calls requestAppDataHydrationRetry() which resets hydration
 *     to idle, causing AppDataBootstrap to re-run the existing pipeline.
 *   - Does NOT manually write user/household/tasks/rewards to the store.
 *   - Does NOT navigate imperatively.
 *   - Does NOT call Supabase directly.
 *   - Does NOT create a household.
 */
export function ProfileSetupScreen() {
  const authUser                    = useAppStore(selectAuthUser);
  const requestAppDataHydrationRetry = useAppStore((s) => s.requestAppDataHydrationRetry);

  const [displayName, setDisplayName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleCreate() {
    if (isSubmitting) return;

    const trimmed = displayName.trim();

    if (!trimmed) {
      setValidationError(copy.profileSetup.validationEmpty);
      return;
    }

    if (!authUser?.id) {
      // Auth user lost between renders — unlikely but safe to guard.
      setSubmitError(copy.profileSetup.error);
      return;
    }

    setValidationError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const result = await ensureProfileExists({
        authUserId:  authUser.id,
        displayName: trimmed,
        avatarEmoji: selectedEmoji,
      });

      if (result.error) {
        setSubmitError(copy.profileSetup.error);
        return;
      }

      // Profile created. Reset hydration state so AppDataBootstrap re-runs
      // the full pipeline for this auth user (profile now exists → proceeds
      // to household phase → reaches partial or hydrated).
      requestAppDataHydrationRetry();

    } catch {
      setSubmitError(copy.profileSetup.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{copy.profileSetup.title}</Text>
        <Text style={styles.body}>{copy.profileSetup.body}</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{copy.profileSetup.fieldLabel}</Text>
          <TextInput
            style={[styles.input, validationError ? styles.inputError : null]}
            value={displayName}
            onChangeText={(text: string) => {
              setDisplayName(text);
              if (validationError) setValidationError(null);
            }}
            placeholder={copy.profileSetup.fieldPlaceholder}
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            editable={!isSubmitting}
          />
          {validationError ? (
            <Text style={styles.validationText}>{validationError}</Text>
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{copy.profileSetup.avatarLabel}</Text>
          <View style={styles.avatarRow}>
            <FamilyAvatar name={displayName} avatarEmoji={selectedEmoji ?? undefined} size={48} />
            <View style={styles.emojiGrid}>
              {AVATAR_EMOJI_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.emojiOption, selectedEmoji === emoji && styles.emojiOptionSelected]}
                  onPress={() => setSelectedEmoji(emoji === selectedEmoji ? null : emoji)}
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emojiOptionText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {submitError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {isSubmitting ? copy.profileSetup.buttonLoading : copy.profileSetup.button}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.background,
    justifyContent:  'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    gap: spacing.md,
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
  avatarRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
  },
  emojiGrid: {
    flex:          1,
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.xs,
  },
  emojiOption: {
    width:           36,
    height:          36,
    borderRadius:    18,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.borderSoft,
  },
  emojiOptionSelected: {
    borderColor:     colors.primary,
    backgroundColor: colors.primarySoft,
  },
  emojiOptionText: {
    fontSize: 18,
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

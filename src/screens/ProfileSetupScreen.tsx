import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { FormScreen } from '@/components/ui/FormScreen';
import { TextField } from '@/components/ui/TextField';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { uploadPickedAvatarPhoto } from '@/features/profile/uploadPickedAvatarPhoto';
import { ensureProfileExists } from '@/lib/repositories';
import { selectAuthUser } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, radius, sizes, spacing, typography } from '@/theme';
import { copy } from '@/content/copy';

// Optional: a member can create their profile with no avatar selected and
// get the initials fallback (see FamilyAvatar) until they set one.
import { AVATAR_EMOJI_OPTIONS } from '@/features/profile/avatarOptions';

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
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handlePickPhoto() {
    if (isUploadingPhoto || isSubmitting || !authUser?.id) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality:    0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setPhotoError(null);
    setIsUploadingPhoto(true);

    try {
      // Raw bytes, never a Blob (see uploadPickedAvatarPhoto /
      // readLocalFileBytes): response.blob() throws on Android in Expo 56.
      const uploadResult = await uploadPickedAvatarPhoto({
        authUserId: authUser.id,
        uri:        asset.uri,
        mimeType:   asset.mimeType,
      });

      if (!uploadResult.ok) {
        setPhotoError(copy.profileSetup.uploadPhotoError);
        return;
      }

      // A photo and an emoji are mutually exclusive in this picker —
      // FamilyAvatar would render the photo first regardless, but keeping
      // only one visibly "selected" avoids an ambiguous UI state.
      setSelectedPhotoUrl(uploadResult.publicUrl);
      setSelectedEmoji(null);
    } catch {
      setPhotoError(copy.profileSetup.uploadPhotoError);
    } finally {
      setIsUploadingPhoto(false);
    }
  }

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
        avatarUrl:   selectedPhotoUrl,
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
    <FormScreen
      title={copy.profileSetup.title}
      subtitle={copy.profileSetup.body}
      hero={<FamilyAvatar name={displayName || '?'} avatarUrl={selectedPhotoUrl ?? undefined} avatarEmoji={selectedEmoji ?? undefined} size={72} />}
    >
      <TextField
        label={copy.profileSetup.fieldLabel}
        value={displayName}
        onChangeText={(text: string) => {
          setDisplayName(text);
          if (validationError) setValidationError(null);
        }}
        placeholder={copy.profileSetup.fieldPlaceholder}
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={handleCreate}
        editable={!isSubmitting}
        error={validationError}
      />

      <Text style={styles.label}>{copy.profileSetup.avatarLabel}</Text>
      <View style={styles.emojiGrid}>
        {AVATAR_EMOJI_OPTIONS.map((emoji) => (
          <Pressable
            key={emoji}
            style={[styles.emojiOption, selectedEmoji === emoji && !selectedPhotoUrl && styles.emojiOptionSelected]}
            onPress={() => {
              setSelectedEmoji(emoji === selectedEmoji ? null : emoji);
              setSelectedPhotoUrl(null);
            }}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedEmoji === emoji && !selectedPhotoUrl }}
            accessibilityLabel={emoji}
          >
            <Text style={styles.emojiOptionText}>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      <AppButton
        label={selectedPhotoUrl ? copy.profileSetup.changePhotoButton : copy.profileSetup.uploadPhotoButton}
        icon="image-outline"
        variant="secondary"
        onPress={() => { void handlePickPhoto(); }}
        busy={isUploadingPhoto}
        disabled={isSubmitting}
      />
      {photoError ? <Banner tone="danger" text={photoError} /> : null}

      {submitError ? <Banner tone="danger" text={submitError} /> : null}

      <AppButton
        label={copy.profileSetup.button}
        onPress={() => { void handleCreate(); }}
        busy={isSubmitting}
        busyLabel={copy.profileSetup.buttonLoading}
        disabled={isUploadingPhoto}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.label,
    color:     colors.textSecondary,
    marginTop: spacing.xs,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  emojiOption: {
    width:           sizes.tapTarget,
    height:          sizes.tapTarget,
    borderRadius:    radius.md,
    borderWidth:     2,
    borderColor:     colors.borderSoft,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },
  emojiOptionSelected: {
    borderColor:     colors.primary,
    backgroundColor: colors.primarySoft,
  },
  emojiOptionText: {
    fontSize: 24,
  },
});

import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FamilyAvatar } from '@/components/FamilyAvatar';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { TextField } from '@/components/ui/TextField';
import { copy } from '@/content/copy';
import { AVATAR_EMOJI_OPTIONS } from '@/features/profile/avatarOptions';
import { saveOwnProfile } from '@/features/profile/saveOwnProfile';
import { uploadPickedAvatarPhoto } from '@/features/profile/uploadPickedAvatarPhoto';
import { selectAuthUser, selectCurrentUser } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, radius, sizes, spacing, typography } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// Settings -> Edit profile: name, emoji avatar, profile photo. The
// onboarding ProfileSetupScreen stays onboarding-only (it is rendered only
// when no profile exists); this is the everyday edit path ROADMAP.md lists
// under "Settings — Planned: Profile".
export function ProfileEditModal({ visible, onClose }: Props) {
  const user     = useAppStore(selectCurrentUser);
  const authUser = useAppStore(selectAuthUser);
  const { height: windowHeight } = useWindowDimensions();

  const [name, setName]               = useState('');
  const [emoji, setEmoji]             = useState<string | null>(null);
  const [photoUrl, setPhotoUrl]       = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [message, setMessage]         = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const savingRef = useRef(false);

  // Start from the current profile each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setName(user?.name ?? '');
    setEmoji(user?.avatarEmoji ?? null);
    setPhotoUrl(user?.avatarUrl ?? null);
    setMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const busy = uploading || saving;

  async function pickPhoto() {
    if (busy || !authUser?.id) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setUploading(true);
      setMessage(null);
      const uploaded = await uploadPickedAvatarPhoto({ authUserId: authUser.id, uri: asset.uri, mimeType: asset.mimeType });
      if (!uploaded.ok) {
        setMessage({ tone: 'danger', text: copy.profileEdit.photoFailed });
        return;
      }
      // Photo and emoji are mutually exclusive in this picker.
      setPhotoUrl(uploaded.publicUrl);
      setEmoji(null);
    } catch {
      setMessage({ tone: 'danger', text: copy.profileEdit.photoFailed });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (busy || savingRef.current) return;
    if (!name.trim()) {
      setMessage({ tone: 'danger', text: copy.profileEdit.nameRequired });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveOwnProfile({ displayName: name, avatarUrl: photoUrl, avatarEmoji: emoji });
      setMessage(result.ok
        ? { tone: 'success', text: copy.profileEdit.saved }
        : { tone: 'danger', text: copy.profileEdit.saveFailed });
    } catch {
      setMessage({ tone: 'danger', text: copy.profileEdit.saveFailed });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={styles.overlay}>
        <SafeAreaView edges={['bottom']} style={[styles.card, { maxHeight: Math.round(windowHeight * sizes.sheetMaxRatio) }]}>
          <SheetHeader title={copy.profileEdit.title} onClose={onClose} closeLabel={copy.profileEdit.close} closeDisabled={busy} />
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            <View style={styles.avatarRow}>
              <FamilyAvatar name={name || '?'} avatarUrl={photoUrl ?? undefined} avatarEmoji={emoji ?? undefined} size={72} />
            </View>

            <TextField
              label={copy.profileEdit.nameLabel}
              value={name}
              onChangeText={(t) => { setName(t); setMessage(null); }}
              placeholder={copy.profileEdit.namePlaceholder}
              editable={!busy}
            />

            <Text style={styles.label}>{copy.profileEdit.avatarLabel}</Text>
            <View style={styles.emojiGrid}>
              {AVATAR_EMOJI_OPTIONS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => { setEmoji(e); setPhotoUrl(null); }}
                  disabled={busy}
                  style={[styles.emoji, emoji === e && !photoUrl && styles.emojiSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: emoji === e && !photoUrl }}
                  accessibilityLabel={e}>
                  <Text style={styles.emojiText}>{e}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>{copy.profileEdit.photoLabel}</Text>
            <View style={styles.row}>
              <AppButton
                label={photoUrl ? copy.profileEdit.changePhoto : copy.profileEdit.choosePhoto}
                icon="image-outline"
                variant="secondary"
                busy={uploading}
                busyLabel={copy.profileEdit.uploadingPhoto}
                onPress={() => { void pickPhoto(); }}
                style={styles.flex}
              />
              {photoUrl ? (
                <AppButton label={copy.profileEdit.removePhoto} variant="ghost" disabled={busy}
                  onPress={() => setPhotoUrl(null)} style={styles.flex} />
              ) : null}
            </View>

            {message && <Banner tone={message.tone} text={message.text} />}
          </ScrollView>

          <AppButton label={copy.profileEdit.save} onPress={() => { void save(); }} busy={saving} busyLabel={copy.profileEdit.saving} disabled={uploading} />
        </SafeAreaView>
      </View>
    </Modal>
  );
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
    gap: spacing.sm,
  },
  avatarRow: {
    alignItems:   'center',
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.label,
    color:     colors.textSecondary,
    marginTop: spacing.sm,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  emoji: {
    width:           sizes.tapTarget,
    height:          sizes.tapTarget,
    borderRadius:    radius.md,
    borderWidth:     2,
    borderColor:     colors.borderSoft,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: colors.surfaceMuted,
  },
  emojiSelected: {
    borderColor:     colors.primary,
    backgroundColor: colors.primarySoft,
  },
  emojiText: {
    fontSize: 24,
  },
  row: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },
  flex: {
    flex: 1,
  },
});

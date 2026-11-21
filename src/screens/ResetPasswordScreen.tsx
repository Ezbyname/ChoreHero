import React, { useState } from 'react';
import { Text } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { FormScreen } from '@/components/ui/FormScreen';
import { TextField } from '@/components/ui/TextField';
import { copy } from '@/content/copy';
import { resetPassword } from '@/features/auth/resetPassword';

// Landing screen for a followed password-recovery email link (see
// AppBootstrap.tsx's 'recovery' branch). A real Supabase session already
// exists at this point (Web: supabase-js's own automatic URL-session
// detection; native: AppBootstrap explicitly awaits setSession() before
// ever rendering this screen — see useAuthRecoveryLink.native.ts) — so
// updateUser({ password }) can be called directly, no separate sign-in
// step. See resetPassword.ts for the password-policy resolution
// (provider-authoritative; no application policy introduced).
//
// Product Decision A (N1.3): after a successful update, the recovery
// session is kept — the user is already signed in, not sent back to Sign
// In. `onExitRecovery` (platform-specific: a page reload on Web, a local
// state transition on native — see useAuthRecoveryExit.ts/.native.ts)
// leaves this screen and continues into the normal authenticated boot.
export function ResetPasswordScreen({ onExitRecovery }: { onExitRecovery: () => void }) {
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword]  = useState('');
  const [isSubmitting,    setIsSubmitting]    = useState(false);
  const [localError,      setLocalError]      = useState<string | null>(null);
  const [showSuccess,     setShowSuccess]     = useState(false);

  async function handleUpdatePassword() {
    if (isSubmitting) return;

    setLocalError(null);
    setIsSubmitting(true);

    try {
      const result = await resetPassword(password, confirmPassword);
      if (!result.ok) {
        setLocalError(
          result.reason === 'invalid_input'
            ? (!password || !confirmPassword ? copy.auth.emptyFieldsError : copy.auth.passwordMismatch)
            : copy.auth.resetPasswordError,
        );
        return;
      }
      setShowSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (showSuccess) {
    return (
      <FormScreen title={copy.auth.passwordUpdatedTitle} subtitle={copy.auth.passwordUpdatedBody} hero={<Text style={heroEmoji}>✅</Text>}>
        <AppButton label={copy.auth.continueToApp} onPress={onExitRecovery} />
      </FormScreen>
    );
  }

  const isButtonDisabled = !password || !confirmPassword;

  return (
    <FormScreen title={copy.auth.resetPasswordTitle} subtitle={copy.auth.resetPasswordSubtitle}>
      <TextField
        label={copy.auth.newPasswordLabel}
        value={password}
        onChangeText={setPassword}
        placeholder={copy.auth.passwordPlaceholder}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
        editable={!isSubmitting}
      />
      <TextField
        label={copy.auth.confirmNewPasswordLabel}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder={copy.auth.passwordPlaceholder}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
        editable={!isSubmitting}
      />

      {localError ? <Banner tone="danger" text={localError} /> : null}

      <AppButton
        label={copy.auth.resetPasswordButton}
        onPress={() => { void handleUpdatePassword(); }}
        disabled={isButtonDisabled}
        busy={isSubmitting}
        busyLabel={copy.auth.updatingPassword}
      />
    </FormScreen>
  );
}

const heroEmoji = { fontSize: 48 } as const;

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { copy } from '@/content/copy';
import { resetPassword } from '@/features/auth/resetPassword';
import { colors, spacing, typography } from '@/theme';

// Landing screen for a followed password-recovery email link (see
// AppBootstrap.tsx's 'recovery' branch). A real Supabase session already
// exists at this point — supabase-js establishes one automatically from
// the recovery link's token before this component ever renders (this is
// the same mechanism AuthBootstrap.tsx's existing PASSWORD_RECOVERY case
// already relies on) — so updateUser({ password }) can be called directly,
// no separate sign-in step. See resetPassword.ts for the password-policy
// resolution (provider-authoritative; no application policy introduced).
//
// After a successful update, this screen shows a static success state
// with a manual "Go to Sign in" action rather than auto-navigating into
// the authenticated app — mirroring EmailConfirmedScreen's own documented
// convention that a redirect-landing tab's session is incidental; the
// user signs in for real on whichever device they actually use ChoreHero
// from. This is an application of that existing precedent, not a new one,
// and is unrelated to the password-policy question above.
export function ResetPasswordScreen() {
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

  function handleGoToSignIn() {
    if (typeof window !== 'undefined') {
      window.location.href = window.location.origin;
    }
  }

  if (showSuccess) {
    return (
      <View style={styles.container}>
        <View style={styles.successContent}>
          <Text style={styles.title}>{copy.auth.passwordUpdatedTitle}</Text>
          <Text style={styles.subtitle}>{copy.auth.passwordUpdatedBody}</Text>
          <TouchableOpacity style={styles.button} onPress={handleGoToSignIn} activeOpacity={0.8}>
            <Text style={styles.buttonText}>{copy.auth.goToSignIn}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isButtonDisabled = isSubmitting || !password || !confirmPassword;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{copy.auth.resetPasswordTitle}</Text>
          <Text style={styles.subtitle}>{copy.auth.resetPasswordSubtitle}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{copy.auth.newPasswordLabel}</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={copy.auth.passwordPlaceholder}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              editable={!isSubmitting}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{copy.auth.confirmNewPasswordLabel}</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={copy.auth.passwordPlaceholder}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              editable={!isSubmitting}
            />
          </View>

          {localError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{localError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, isButtonDisabled && styles.buttonDisabled]}
            onPress={handleUpdatePassword}
            disabled={isButtonDisabled}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? copy.auth.updatingPassword : copy.auth.resetPasswordButton}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  successContent: {
    flex: 1, paddingHorizontal: spacing.xl, alignItems: 'center',
    justifyContent: 'center', maxWidth: 320, alignSelf: 'center',
  },
  header: { marginBottom: spacing.xxxl, alignItems: 'center' },
  title: { ...typography.heading, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  form: { gap: spacing.md },
  fieldGroup: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  input: {
    ...typography.body, color: colors.textPrimary, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 10,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  errorBox: { backgroundColor: colors.errorSoft, borderRadius: 8, padding: spacing.md },
  errorText: { ...typography.caption, color: '#B91C1C' },
  button: {
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl, alignItems: 'center', marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { ...typography.body, color: colors.surface, fontWeight: '600' },
});

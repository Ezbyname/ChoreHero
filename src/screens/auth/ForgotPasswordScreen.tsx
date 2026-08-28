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
import { isRateLimitError, sendPasswordResetEmail } from '@/services/supabase/auth';
import { useResendCooldown } from '@/lib/useResendCooldown';
import { colors, spacing, typography } from '@/theme';

// `onBack` is a plain callback rather than useNavigation() so this screen
// can be rendered both inside AuthStack's NavigationContainer (the normal
// case) and inside AppBootstrap's early-return recovery branch (N1.3
// corrective patch — "Request a new link" from an expired recovery link),
// which has no NavigationContainer mounted at all. See AuthStack.tsx for
// how the normal case supplies onBack, and AppBootstrap.tsx for the
// recovery-mode case.
//
// Enumeration-safe by construction: the success state's copy
// (resetLinkSentTitle/Body) is shown identically whether or not the
// submitted email is actually registered — resetPasswordForEmail() itself
// never reveals this. A genuine request error (rate-limited, network,
// malformed input) is a separate, safe-to-show concern — see handleSend.
export function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const [email,        setEmail]        = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError,   setLocalError]   = useState<string | null>(null);
  const [showSuccess,  setShowSuccess]  = useState(false);
  const { secondsRemaining, start: startCooldown } = useResendCooldown();

  async function handleSend() {
    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setLocalError(copy.auth.emptyFieldsError);
      return;
    }

    setLocalError(null);
    setIsSubmitting(true);

    try {
      const { error } = await sendPasswordResetEmail(normalizedEmail);
      if (error) {
        // A real request error (rate-limited, network, malformed input) —
        // distinct from "email not registered", which resetPasswordForEmail
        // never reveals in the first place, so surfacing this specific
        // error is not an enumeration regression.
        setLocalError(isRateLimitError(error) ? copy.auth.resetLinkRateLimited : copy.auth.resetLinkRequestError);
        return;
      }
      setShowSuccess(true);
      startCooldown();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (secondsRemaining > 0) return;
    const normalizedEmail = email.trim().toLowerCase();
    setLocalError(null);
    const { error } = await sendPasswordResetEmail(normalizedEmail);
    if (error) {
      setLocalError(isRateLimitError(error) ? copy.auth.resetLinkRateLimited : copy.auth.resetLinkRequestError);
      return;
    }
    startCooldown();
  }

  if (showSuccess) {
    return (
      <View style={styles.container}>
        <View style={styles.successContent}>
          <Text style={styles.title}>{copy.auth.resetLinkSentTitle}</Text>
          <Text style={styles.subtitle}>{copy.auth.resetLinkSentBody}</Text>

          {localError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{localError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, secondsRemaining > 0 && styles.buttonDisabled]}
            onPress={handleResend}
            disabled={secondsRemaining > 0}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {secondsRemaining > 0
                ? copy.auth.resendEmailCountdown.replace('{n}', String(secondsRemaining))
                : copy.auth.resendEmailButton}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkRow} onPress={onBack}>
            <Text style={styles.linkText}>{copy.auth.backToSignIn}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{copy.auth.forgotPasswordTitle}</Text>
          <Text style={styles.subtitle}>{copy.auth.forgotPasswordSubtitle}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{copy.auth.emailLabel}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={copy.auth.emailPlaceholder}
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!isSubmitting}
            />
          </View>

          {localError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{localError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleSend}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? copy.auth.sendingResetLink : copy.auth.forgotPasswordButton}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkRow} onPress={onBack} disabled={isSubmitting}>
            <Text style={styles.linkText}>{copy.auth.backToSignIn}</Text>
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
  linkRow: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.caption, color: colors.primary },
});

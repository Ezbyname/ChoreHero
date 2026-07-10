import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import type { AuthStackParamList } from '@/navigation/types';
import { signUpWithEmail } from '@/services/supabase/auth';
import { colors, spacing, typography } from '@/theme';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Signup'>;

/**
 * Signup Screen MVP.
 *
 * Creates a Supabase Auth identity only — no profile, no household, no onboarding.
 *
 * After a successful signup:
 *   - If Supabase returns a session: AuthBootstrap listener fires → Zustand updates
 *     → AuthGate switches to RootNavigator. This screen does nothing.
 *   - If Supabase requires email confirmation (no session): show dedicated
 *     "Check your email" success state. Do not navigate imperatively.
 *
 * This screen must not:
 *   - write auth state to Zustand
 *   - navigate to RootNavigator after signup
 *   - call Supabase directly (uses signUpWithEmail wrapper)
 *   - create profiles, households, or app user mappings
 */
export function SignupScreen() {
  const navigation = useNavigation<Nav>();

  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting,    setIsSubmitting]    = useState(false);
  const [localError,      setLocalError]      = useState<string | null>(null);
  const [showSuccess,     setShowSuccess]     = useState(false);

  async function handleCreateAccount() {
    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password || !confirmPassword) {
      setLocalError(copy.auth.emptyFieldsError);
      return;
    }

    if (password !== confirmPassword) {
      setLocalError(copy.auth.passwordMismatch);
      return;
    }

    setLocalError(null);
    setIsSubmitting(true);

    try {
      const { data, error } = await signUpWithEmail(normalizedEmail, password);

      if (error) {
        setLocalError(copy.auth.signupError);
        return;
      }

      if (!data.session) {
        // Supabase requires email confirmation — no session yet.
        setShowSuccess(true);
      }
      // If data.session exists, AuthBootstrap fires and AuthGate handles transition.
    } catch {
      setLocalError(copy.auth.signupError);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Email confirmation success state ────────────────────────────────────────

  if (showSuccess) {
    return (
      <View style={styles.container}>
        <View style={styles.successContent}>
          <Text style={styles.title}>{copy.auth.signupCheckEmailTitle}</Text>
          <Text style={styles.subtitle}>{copy.auth.signupCheckEmail}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>{copy.auth.backToSignIn}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Signup form ─────────────────────────────────────────────────────────────

  const isButtonDisabled =
    isSubmitting || !email.trim() || !password || !confirmPassword;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{copy.auth.signupTitle}</Text>
          <Text style={styles.subtitle}>{copy.auth.signupSubtitle}</Text>
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
              textContentType="emailAddress"
              editable={!isSubmitting}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{copy.auth.passwordLabel}</Text>
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
            <Text style={styles.label}>{copy.auth.confirmPasswordLabel}</Text>
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
            onPress={handleCreateAccount}
            disabled={isButtonDisabled}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? copy.auth.creatingAccount : copy.auth.createAccount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('Login')}
            disabled={isSubmitting}
          >
            <Text style={styles.linkText}>{copy.auth.signupToLogin}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex:            1,
    backgroundColor: colors.background,
  },
  container: {
    flex:              1,
    paddingHorizontal: spacing.xl,
    justifyContent:    'center',
  },
  successContent: {
    flex:              1,
    paddingHorizontal: spacing.xl,
    alignItems:        'center',
    justifyContent:    'center',
    maxWidth:          320,
    alignSelf:         'center',
  },
  header: {
    marginBottom: spacing.xxxl,
    alignItems:   'center',
  },
  title: {
    ...typography.heading,
    color:        colors.textPrimary,
    textAlign:    'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color:     colors.textMuted,
    textAlign: 'center',
  },
  form: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color:      colors.textSecondary,
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
  errorBox: {
    backgroundColor: colors.errorSoft,
    borderRadius:    8,
    padding:         spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: '#B91C1C',
  },
  button: {
    backgroundColor:   colors.primary,
    borderRadius:      12,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems:        'center',
    marginTop:         spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.body,
    color:      colors.surface,
    fontWeight: '600',
  },
  linkRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  linkText: {
    ...typography.caption,
    color: colors.primary,
  },
});

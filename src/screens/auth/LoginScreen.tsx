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
import { signInWithEmail } from '@/services/supabase/auth';
import { colors, spacing, typography } from '@/theme';

/**
 * Login Screen MVP.
 *
 * After a successful sign-in, this screen does nothing.
 * AuthBootstrap's onAuthStateChange fires → Zustand is updated → AuthGate
 * switches to RootNavigator automatically.
 *
 * This screen must not:
 *   - write auth state to Zustand
 *   - navigate imperatively after sign-in
 *   - call Supabase directly
 */
export function LoginScreen() {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [localError,  setLocalError]  = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    if (isSubmitting) return;

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setLocalError(copy.auth.emptyFieldsError);
      return;
    }

    setLocalError(null);
    setIsSubmitting(true);

    try {
      const { error } = await signInWithEmail(trimmedEmail, password);
      if (error) {
        setLocalError(copy.auth.loginError);
      }
      // On success: no action needed here.
      // AuthBootstrap listener fires → Zustand updates → AuthGate re-renders.
    } catch {
      setLocalError(copy.auth.loginError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{copy.auth.loginTitle}</Text>
          <Text style={styles.subtitle}>{copy.auth.loginSubtitle}</Text>
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
              autoComplete="current-password"
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
            onPress={handleSignIn}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? copy.auth.signingIn : copy.auth.signInButton}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex:              1,
    paddingHorizontal: spacing.xl,
    justifyContent:    'center',
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
    backgroundColor: colors.primary,
    borderRadius:    12,
    paddingVertical: spacing.md,
    alignItems:      'center',
    marginTop:       spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.body,
    color:      colors.surface,
    fontWeight: '600',
  },
});

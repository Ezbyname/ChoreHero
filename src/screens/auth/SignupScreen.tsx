import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { FormScreen } from '@/components/ui/FormScreen';
import { TextField } from '@/components/ui/TextField';
import { copy } from '@/content/copy';
import type { AuthStackParamList } from '@/navigation/types';
import { resendSignupEmail, signUpWithEmail } from '@/services/supabase/auth';
import { useResendCooldown } from '@/lib/useResendCooldown';

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
  const { secondsRemaining, start: startCooldown } = useResendCooldown();

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
        startCooldown();
      }
      // If data.session exists, AuthBootstrap fires and AuthGate handles transition.
    } catch {
      setLocalError(copy.auth.signupError);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (secondsRemaining > 0) return;
    const normalizedEmail = email.trim().toLowerCase();
    await resendSignupEmail(normalizedEmail);
    startCooldown();
  }

  // ── Email confirmation success state ────────────────────────────────────────

  if (showSuccess) {
    return (
      <FormScreen title={copy.auth.signupCheckEmailTitle} subtitle={copy.auth.signupCheckEmail} hero={<Text style={heroEmoji}>📬</Text>}>
        <AppButton
          label={secondsRemaining > 0
            ? copy.auth.resendEmailCountdown.replace('{n}', String(secondsRemaining))
            : copy.auth.resendEmailButton}
          variant="secondary"
          onPress={() => { void handleResend(); }}
          disabled={secondsRemaining > 0}
        />
        <AppButton label={copy.auth.backToSignIn} onPress={() => navigation.navigate('Login')} />
      </FormScreen>
    );
  }

  // ── Signup form ─────────────────────────────────────────────────────────────

  const isButtonDisabled = !email.trim() || !password || !confirmPassword;

  return (
    <FormScreen title={copy.auth.signupTitle} subtitle={copy.auth.signupSubtitle}>
      <TextField
        label={copy.auth.emailLabel}
        value={email}
        onChangeText={setEmail}
        placeholder={copy.auth.emailPlaceholder}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        editable={!isSubmitting}
      />
      <TextField
        label={copy.auth.passwordLabel}
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
        label={copy.auth.confirmPasswordLabel}
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
        label={copy.auth.createAccount}
        onPress={() => { void handleCreateAccount(); }}
        disabled={isButtonDisabled}
        busy={isSubmitting}
        busyLabel={copy.auth.creatingAccount}
      />
      <AppButton
        label={copy.auth.signupToLogin}
        variant="ghost"
        compact
        onPress={() => navigation.navigate('Login')}
        disabled={isSubmitting}
      />
    </FormScreen>
  );
}

const heroEmoji = { fontSize: 48 } as const;

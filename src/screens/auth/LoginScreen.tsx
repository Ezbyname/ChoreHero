import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { FormScreen } from '@/components/ui/FormScreen';
import { TextField } from '@/components/ui/TextField';
import { copy } from '@/content/copy';
import type { AuthStackParamList } from '@/navigation/types';
import {
  INITIAL_SHOW_PASSWORD,
  isPasswordMasked,
  showPasswordAccessibilityState,
  togglePasswordVisibility,
} from '@/screens/auth/passwordVisibility';
import { signInWithEmail } from '@/services/supabase/auth';
import { colors, spacing, typography } from '@/theme';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

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
  const navigation = useNavigation<Nav>();

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [localError,   setLocalError]   = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(INITIAL_SHOW_PASSWORD);

  async function handleSignIn() {
    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setLocalError(copy.auth.emptyFieldsError);
      return;
    }

    setLocalError(null);
    setIsSubmitting(true);

    try {
      const { error } = await signInWithEmail(normalizedEmail, password);
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
    <FormScreen title={copy.auth.loginTitle} subtitle={copy.auth.loginSubtitle}>
      <TextField
        label={copy.auth.emailLabel}
        value={email}
        onChangeText={setEmail}
        placeholder={copy.auth.emailPlaceholder}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        editable={!isSubmitting}
      />

      <TextField
        label={copy.auth.passwordLabel}
        value={password}
        onChangeText={setPassword}
        placeholder={copy.auth.passwordPlaceholder}
        secureTextEntry={isPasswordMasked(showPassword)}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        editable={!isSubmitting}
      >
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setShowPassword(togglePasswordVisibility)}
          accessibilityRole="checkbox"
          accessibilityState={showPasswordAccessibilityState(showPassword)}
          accessibilityLabel={copy.auth.showPasswordLabel}
          hitSlop={{ top: 8, bottom: 8 }}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, showPassword && styles.checkboxChecked]}>
            {showPassword ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={styles.checkboxLabel}>{copy.auth.showPasswordLabel}</Text>
        </TouchableOpacity>
      </TextField>

      {localError ? <Banner tone="danger" text={localError} /> : null}

      <AppButton
        label={copy.auth.signInButton}
        onPress={() => { void handleSignIn(); }}
        busy={isSubmitting}
        busyLabel={copy.auth.signingIn}
      />

      <AppButton
        label={copy.auth.forgotPasswordLink}
        variant="ghost"
        compact
        onPress={() => navigation.navigate('ForgotPassword')}
        disabled={isSubmitting}
      />
      <AppButton
        label={copy.auth.loginToSignup}
        variant="ghost"
        compact
        onPress={() => navigation.navigate('Signup')}
        disabled={isSubmitting}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  checkboxRow: {
    flexDirection:   'row',
    alignItems:      'center',
    alignSelf:       'flex-start',
    gap:             spacing.sm,
    minHeight:       40,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width:           22,
    height:          22,
    borderRadius:    4,
    borderWidth:     1.5,
    borderColor:     colors.textMuted,
    backgroundColor: colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor:     colors.primary,
  },
  checkboxMark: {
    color:      colors.textOnColor,
    fontSize:   13,
    fontWeight: '700',
    lineHeight: 15,
  },
  checkboxLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

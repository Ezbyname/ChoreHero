// src/screens/RecoveryLinkExpiredScreen.tsx
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { copy } from '@/content/copy';
import { colors, spacing, typography } from '@/theme';

// Shown when AppBootstrap classifies this tab's URL as an auth-redirect
// error (expired, invalid, or already-used recovery link — see
// authRedirectDetection.ts). Previously such a link silently fell through
// to a normal app boot with no explanation; this is the fix.
//
// This screen renders inside AppBootstrap's early-return branch, the same
// place EmailConfirmedScreen does — there is no NavigationContainer/
// AuthStack mounted yet at this point, so it cannot use react-navigation's
// navigate(). `onRequestNewLink` is a local AppBootstrap state transition
// into its recovery-mode ForgotPasswordScreen — deliberately NOT the
// generic "exit recovery" mechanism (useAuthRecoveryExit): that mechanism
// falls through to whatever the current auth state happens to be, which on
// a device with an existing valid session silently skipped straight to the
// authenticated app instead of ever showing a request-a-new-link form —
// a real bug this fixes. "Request a new link" must always mean requesting
// a new link, independent of whether a session happens to already exist.
export function RecoveryLinkExpiredScreen({ onRequestNewLink }: { onRequestNewLink: () => void }) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{copy.auth.recoveryLinkExpiredTitle}</Text>
        <Text style={styles.body}>{copy.auth.recoveryLinkExpiredBody}</Text>
        <TouchableOpacity style={styles.button} onPress={onRequestNewLink} activeOpacity={0.8}>
          <Text style={styles.buttonText}>{copy.auth.forgotPasswordLink}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    backgroundColor:   colors.background,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth:   320,
  },
  title: {
    ...typography.heading,
    color:        colors.textPrimary,
    textAlign:    'center',
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color:        colors.textSecondary,
    textAlign:    'center',
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor:   colors.primary,
    borderRadius:      12,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems:        'center',
  },
  buttonText: {
    ...typography.body,
    color:      colors.surface,
    fontWeight: '600',
  },
});

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
// navigate(). "Request a new link" instead does a full-page redirect to
// this app's own root, landing the user on the normal AuthStack, from
// which they can reach ForgotPasswordScreen through the ordinary Login
// link (Task 8) exactly like any other visitor.
export function RecoveryLinkExpiredScreen() {
  function handleRequestNewLink() {
    if (typeof window !== 'undefined') {
      window.location.href = window.location.origin;
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{copy.auth.recoveryLinkExpiredTitle}</Text>
        <Text style={styles.body}>{copy.auth.recoveryLinkExpiredBody}</Text>
        <TouchableOpacity style={styles.button} onPress={handleRequestNewLink} activeOpacity={0.8}>
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

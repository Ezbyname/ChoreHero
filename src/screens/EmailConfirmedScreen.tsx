import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { copy } from '@/content/copy';
import { colors, spacing, typography } from '@/theme';

// Shown when the app loads directly from a Supabase email-confirmation
// redirect (see hasAuthRedirectMarkers in AppBootstrap.tsx). This tab's
// session is incidental — the user signs in for real on whichever device
// they actually use ChoreHero from — so this deliberately does not boot
// the normal authenticated app flow.
export function EmailConfirmedScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{copy.auth.emailConfirmedTitle}</Text>
        <Text style={styles.body}>{copy.auth.emailConfirmedBody}</Text>
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
    color:     colors.textSecondary,
    textAlign: 'center',
  },
});

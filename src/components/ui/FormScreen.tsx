import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/theme';

type Props = {
  title:     string;
  subtitle?: string | null;
  // Optional visual above the title (emoji / avatar).
  hero?:     React.ReactNode;
  children:  React.ReactNode;
};

// Shell for every full-screen form outside the tabs (sign in / up, password
// reset, recovery states, onboarding): safe area, keyboard avoidance AND a
// scroll view, so on a small Android screen or with large system font the
// keyboard can never hide a field or the main button. Taps on buttons work
// on the first touch while the keyboard is open ("handled").
export function FormScreen({ title, subtitle, hero, children }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <View style={styles.header}>
              {hero}
              <Text style={styles.title} accessibilityRole="header">{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <View style={styles.body}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow:          1,
    justifyContent:    'center',
    paddingHorizontal: spacing.xl,
    paddingVertical:   spacing.xxl,
  },
  column: {
    width:     '100%',
    maxWidth:  480,
    alignSelf: 'center',
  },
  header: {
    alignItems:   'center',
    gap:          spacing.sm,
    marginBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
    color:     colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  body: {
    gap: spacing.md,
  },
});

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { copy } from '@/content/copy';
import type { AuthStackParamList } from '@/navigation/types';
import { colors, spacing, typography } from '@/theme';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'AuthWelcome'>;

export function AuthWelcomeScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{copy.auth.welcomeTitle}</Text>
        <Text style={styles.subtitle}>{copy.auth.welcomeSubtitle}</Text>
        <Text style={styles.body}>{copy.auth.welcomeBody}</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>{copy.auth.signInButton}</Text>
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
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color:        colors.textMuted,
    textAlign:    'center',
    marginBottom: spacing.lg,
  },
  body: {
    ...typography.caption,
    color:        colors.textMuted,
    textAlign:    'center',
    marginBottom: spacing.xxxl,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius:    12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    alignItems:      'center',
  },
  buttonText: {
    ...typography.body,
    color:      colors.surface,
    fontWeight: '600',
  },
});

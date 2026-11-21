import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { FormScreen } from '@/components/ui/FormScreen';
import { copy } from '@/content/copy';
import type { AuthStackParamList } from '@/navigation/types';
import { colors, spacing, typography } from '@/theme';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'AuthWelcome'>;

export function AuthWelcomeScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <FormScreen title={copy.auth.welcomeTitle} subtitle={copy.auth.welcomeSubtitle} hero={<Text style={styles.hero}>🦸</Text>}>
      <Text style={styles.body}>{copy.auth.welcomeBody}</Text>
      <AppButton label={copy.auth.createAccount} onPress={() => navigation.navigate('Signup')} />
      <AppButton label={copy.auth.signInButton} variant="secondary" onPress={() => navigation.navigate('Login')} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    fontSize: 56,
  },
  body: {
    ...typography.body,
    color:        colors.textSecondary,
    textAlign:    'center',
    marginBottom: spacing.sm,
  },
});

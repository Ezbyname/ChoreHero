import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { createHouseholdWithOwner } from '@/lib/repositories';
import { selectAuthUser } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, spacing, typography } from '@/theme';
import { copy } from '@/content/copy';

/**
 * Recovery UX for authenticated users who have a profile but no household yet.
 *
 * Architecture boundaries:
 *   - Reads auth user id from store (selectAuthUser).
 *   - Calls createHouseholdWithOwner (repository layer only).
 *   - On success: calls requestAppDataHydrationRetry() — a trigger only.
 *     AppDataBootstrap re-runs the full pipeline; this screen does not.
 *   - Does NOT manually write user/household/tasks/rewards to the store.
 *   - Does NOT navigate imperatively.
 *   - Does NOT call Supabase directly.
 *   - Does NOT call resetAppState or clear auth state.
 *   - isSubmitting guard prevents duplicate submissions and concurrent requests.
 */
export function HouseholdSetupScreen() {
  const authUser                     = useAppStore(selectAuthUser);
  const requestAppDataHydrationRetry = useAppStore((s) => s.requestAppDataHydrationRetry);

  const [householdName, setHouseholdName]     = useState('');
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError]         = useState<string | null>(null);

  async function handleCreate() {
    // Duplicate-submit guard: ignore any tap while a request is in flight.
    if (isSubmitting) return;

    const trimmed = householdName.trim();

    if (!trimmed) {
      setValidationError(copy.householdSetup.validationEmpty);
      return;
    }

    if (!authUser?.id) {
      // Auth user lost between renders — unlikely but safe to guard.
      setSubmitError(copy.householdSetup.error);
      return;
    }

    setValidationError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const result = await createHouseholdWithOwner({
        name:           trimmed,
        ownerProfileId: authUser.id,
      });

      if (result.error) {
        setSubmitError(copy.householdSetup.error);
        return;
      }

      // Household created. Request a hydration retry so AppDataBootstrap
      // re-runs the full pipeline (household now exists → proceeds to domain
      // phase → reaches hydrated). This screen does not execute hydration.
      requestAppDataHydrationRetry();

    } catch {
      setSubmitError(copy.householdSetup.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{copy.householdSetup.title}</Text>
        <Text style={styles.body}>{copy.householdSetup.body}</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{copy.householdSetup.fieldLabel}</Text>
          <TextInput
            style={[styles.input, validationError ? styles.inputError : null]}
            value={householdName}
            onChangeText={(text: string) => {
              setHouseholdName(text);
              if (validationError) setValidationError(null);
            }}
            placeholder={copy.householdSetup.fieldPlaceholder}
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            editable={!isSubmitting}
          />
          {validationError ? (
            <Text style={styles.validationText}>{validationError}</Text>
          ) : null}
        </View>

        {submitError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {isSubmitting ? copy.householdSetup.buttonLoading : copy.householdSetup.button}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    backgroundColor:   colors.background,
    justifyContent:    'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    gap: spacing.md,
  },
  title: {
    ...typography.heading,
    color:        colors.textPrimary,
    marginBottom: spacing.xs,
  },
  body: {
    ...typography.body,
    color:        colors.textSecondary,
    marginBottom: spacing.sm,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color:      colors.textMuted,
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
  inputError: {
    borderColor: '#B91C1C',
  },
  validationText: {
    ...typography.caption,
    color: '#B91C1C',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius:    8,
    padding:         spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: '#B91C1C',
  },
  button: {
    backgroundColor: colors.primary ?? colors.textPrimary,
    borderRadius:    10,
    paddingVertical: spacing.md,
    alignItems:      'center',
    marginTop:       spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    color:      '#FFFFFF',
    fontWeight: '600',
  },
});

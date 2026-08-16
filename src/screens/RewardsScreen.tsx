import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { getMemberNameByUserId } from '@/features/household/householdUtils';
import { RewardCard } from '@/features/rewards/components/RewardCard';
import { createReward } from '@/features/rewards/createReward';
import { useAppStore } from '@/store/useAppStore';
import {
  selectCanCreateRewards,
  selectCurrentHousehold,
  selectCurrentMemberRole,
  selectCurrentUser,
  selectPointsBalances,
  selectRewards,
} from '@/store/selectors';
import { colors, radius, spacing, typography } from '@/theme';

function CreateRewardForm({
  householdId,
  createdByProfileId,
  role,
}: {
  householdId:        string;
  createdByProfileId: string;
  role:                string | null;
}) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [pointsText, setPointsText]   = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback]       = useState<string | null>(null);
  const [validation, setValidation]   = useState<string | null>(null);

  async function handleCreate() {
    if (isSubmitting) return;

    const trimmed = title.trim();
    if (!trimmed) {
      setValidation(copy.createReward.validationEmpty);
      return;
    }

    const requiredPoints = Number(pointsText.trim());
    if (!Number.isInteger(requiredPoints) || requiredPoints <= 0) {
      setValidation(copy.createReward.validationPoints);
      return;
    }

    setValidation(null);
    setFeedback(null);
    setIsSubmitting(true);

    const result = await createReward({
      householdId,
      title:              trimmed,
      description:        description.trim() || undefined,
      requiredPoints,
      createdByProfileId,
      role,
    });

    if (result.ok) {
      setTitle('');
      setDescription('');
      setPointsText('');
      setFeedback(copy.createReward.success);
    } else {
      setFeedback(copy.createReward.error);
    }
    setIsSubmitting(false);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{copy.createReward.title}</Text>

      <TextInput
        style={[styles.input, validation && styles.inputError]}
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          if (validation) setValidation(null);
        }}
        placeholder={copy.createReward.fieldPlaceholder}
        placeholderTextColor={colors.textMuted}
        editable={!isSubmitting}
        returnKeyType="done"
      />

      <Text style={styles.label}>{copy.createReward.descriptionLabel}</Text>
      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={description}
        onChangeText={setDescription}
        placeholder={copy.createReward.descriptionPlaceholder}
        placeholderTextColor={colors.textMuted}
        editable={!isSubmitting}
        multiline
      />

      <Text style={styles.label}>{copy.createReward.pointsLabel}</Text>
      <TextInput
        style={styles.input}
        value={pointsText}
        onChangeText={(text) => {
          setPointsText(text);
          if (validation) setValidation(null);
        }}
        placeholder={copy.createReward.pointsPlaceholder}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        editable={!isSubmitting}
      />
      {validation && <Text style={styles.validationText}>{validation}</Text>}

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={isSubmitting}
        activeOpacity={0.8}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : (
          <Text style={styles.buttonText}>{copy.createReward.button}</Text>
        )}
      </TouchableOpacity>

      {feedback && <Text style={styles.feedbackText}>{feedback}</Text>}
    </View>
  );
}

export function RewardsScreen() {
  const rewards           = useAppStore(selectRewards);
  const pointsBalances    = useAppStore(selectPointsBalances);
  const household          = useAppStore(selectCurrentHousehold);
  const user                 = useAppStore(selectCurrentUser);
  const role                  = useAppStore(selectCurrentMemberRole);
  const canCreateRewards       = useAppStore(selectCanCreateRewards);
  const members        = household?.members ?? [];

  const activeRewards   = rewards.filter((r) => r.isActive);
  // First balance used for progress context — child selector added in a future ticket
  const selectedBalance = pointsBalances[0];

  return (
    <Screen style={styles.screen}>
      <ScreenHeader
        title={copy.screens.rewards.title}
        subtitle={copy.screens.rewards.subtitle}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {canCreateRewards && household && user && (
          <CreateRewardForm
            householdId={household.id}
            createdByProfileId={user.id}
            role={role}
          />
        )}

        <Text style={styles.sectionLabel}>{copy.rewards.familyPoints}</Text>
        <View style={styles.pointsSection}>
          {pointsBalances.map((pb) => (
            <View key={pb.userId} style={styles.pointsRow}>
              <Text style={styles.pointsName}>
                {getMemberNameByUserId(members, pb.userId)}
              </Text>
              <Text style={styles.pointsValue}>
                {pb.balance} {copy.rewards.pointsLabel}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>{copy.rewards.availableRewards}</Text>

        {activeRewards.length === 0 || !selectedBalance ? (
          <EmptyState message={copy.rewards.noRewards} emoji="🎁" />
        ) : (
          activeRewards.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              pointsBalance={selectedBalance}
              memberName={getMemberNameByUserId(members, selectedBalance.userId)}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom:     spacing.xxxl,
  },
  sectionLabel: {
    ...typography.caption,
    color:         colors.textMuted,
    fontWeight:    '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom:  spacing.sm,
    marginTop:     spacing.lg,
  },
  pointsSection: {
    backgroundColor: colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     colors.borderSoft,
    paddingVertical: spacing.xs,
    marginBottom:    spacing.md,
  },
  pointsRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  pointsName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  pointsValue: {
    ...typography.body,
    color:      colors.primary,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.body,
    color:        colors.textPrimary,
    fontWeight:   '600',
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    color:      colors.textMuted,
    fontWeight: '600',
    marginTop:  spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    color:             colors.textPrimary,
    backgroundColor:   colors.surface,
    borderWidth:       1,
    borderColor:       colors.borderSoft,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
  },
  multilineInput: {
    minHeight:         72,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#B91C1C',
  },
  validationText: {
    ...typography.caption,
    color: '#B91C1C',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    alignItems:      'center',
    marginTop:       spacing.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    color:      colors.surface,
    fontWeight: '600',
  },
  feedbackText: {
    ...typography.caption,
    color:     colors.textMuted,
    marginTop: spacing.sm,
  },
});

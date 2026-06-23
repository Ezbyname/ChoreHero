import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { copy } from '@/content/copy';
import { getMemberNameByUserId } from '@/features/household/householdUtils';
import { RewardCard } from '@/features/rewards/components/RewardCard';
import { mockHousehold, mockPointsBalances, mockRewards } from '@/mock';
import { colors, spacing, typography } from '@/theme';

// First balance used for progress context — extended by child selector in a future ticket
const selectedBalance = mockPointsBalances[0];

export function RewardsScreen() {
  const members        = mockHousehold.members;
  const activeRewards  = mockRewards.filter((r) => r.isActive);

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
        {/* Points summary */}
        <Text style={styles.sectionLabel}>{copy.rewards.familyPoints}</Text>
        <View style={styles.pointsSection}>
          {mockPointsBalances.map((pb) => {
            const name = getMemberNameByUserId(members, pb.userId);
            return (
              <View key={pb.userId} style={styles.pointsRow}>
                <Text style={styles.pointsName}>{name}</Text>
                <Text style={styles.pointsValue}>
                  {pb.balance} {copy.rewards.pointsLabel}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Rewards list */}
        <Text style={styles.sectionLabel}>{copy.rewards.availableRewards}</Text>

        {activeRewards.length === 0 ? (
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
    color:        colors.textMuted,
    fontWeight:   '600',
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
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
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
});

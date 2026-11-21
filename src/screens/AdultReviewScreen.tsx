import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { copy } from '@/content/copy';
import { findAttentionItem, type AttentionKind } from '@/features/adultHome/adultHomeModel';
import { useAdultHomeInput } from '@/features/adultHome/useAdultHomeInput';
import { pendingPhotoCountByTask } from '@/features/tasks/taskListSections';
import { ContributionReviewSection, RedemptionReviewSection, TaskReviewSection } from '@/screens/TodayScreen';
import { selectCurrentHousehold, selectCurrentMemberRole, selectCurrentUser, selectRewards } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, lockedSpacing as sp, typography } from '@/theme';

// Slice 6A: where an Adult Home "Review" row goes. It is an entry point
// only: it renders the EXISTING review section for that one item, exactly
// as the old Home showed it (same cards, the same Approve / Decline
// actions, the same confirmation and evidence sheets, the same mutations
// and error copy). No review rule lives here.
//   - mission_review       → TaskReviewSection (TaskReviewEvidenceModal)
//   - reward_request       → RedemptionReviewSection (ConfirmRewardReviewModal)
//   - helpful_contribution → ContributionReviewSection
// The item is found through findAttentionItem, the same rules the Home
// list uses, so a resolved, not-permitted or own item never opens. When
// the item stops being actionable after a decision (approved, declined,
// or reviewed by someone else), the screen goes back to Home.
// It is a root-stack screen above the tabs, so the review sheets it opens
// are never a modal inside another modal.
export function AdultReviewScreen({ kind, id, onDone }: { kind: AttentionKind; id: string; onDone: () => void }) {
  const input     = useAdultHomeInput();
  const household = useAppStore(selectCurrentHousehold);
  const user      = useAppStore(selectCurrentUser);
  const role      = useAppStore(selectCurrentMemberRole);
  // The full household array, archived rewards included (Decision 7).
  const rewards   = useAppStore(selectRewards);
  const item      = useMemo(() => findAttentionItem(input, kind, id), [input, kind, id]);

  // Back to Home once the item that was open is no longer actionable.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (item) wasOpen.current = true;
    else if (wasOpen.current) onDone();
  }, [item, onDone]);

  const photoCounts = useMemo(() => pendingPhotoCountByTask(input.taskSubmissions), [input.taskSubmissions]);
  const members     = household?.members ?? [];

  let body: React.ReactNode = null;
  if (item && household) {
    if (kind === 'mission_review') {
      const task = input.tasks.find((t) => t.id === id);
      if (task) body = <TaskReviewSection tasks={[task]} members={members} role={role} photoCounts={photoCounts} />;
    } else if (kind === 'reward_request') {
      const redemption = input.redemptions.find((r) => r.id === id);
      if (redemption) {
        body = (
          <RedemptionReviewSection
            redemptions={[redemption]}
            rewards={rewards}
            members={members}
            householdId={household.id}
            role={role}
            reviewerId={user?.id ?? ''}
          />
        );
      }
    } else {
      const claim = input.claims.find((c) => c.id === id);
      if (claim) {
        body = (
          <ContributionReviewSection
            claims={[claim]}
            members={members}
            householdId={household.id}
            role={role}
            reviewerId={user?.id ?? ''}
          />
        );
      }
    }
  }

  return (
    <Screen style={styles.screen} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {body ?? (
          <View style={styles.gone}>
            <Text style={styles.goneText}>{copy.adultHome.reviewGone}</Text>
            <AppButton label={copy.adultHome.backToHome} variant="secondary" density="adult" onPress={onDone} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    backgroundColor:   colors.adultGround,
  },
  content: {
    padding: sp.lg,
  },
  gone: {
    gap:        sp.lg,
    paddingTop: sp.xxl,
  },
  goneText: {
    ...typography.body,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
});

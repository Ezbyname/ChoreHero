import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { CreateTaskForm } from '@/screens/AssignedByMeScreen';
import { selectCanCreateTasks, selectCurrentHousehold, selectCurrentMemberRole, selectCurrentUser } from '@/store/selectors';
import { useAppStore } from '@/store/useAppStore';
import { colors, lockedSpacing as sp } from '@/theme';

// Slice 6B: the New mission route (root stack, adult shell). It hosts the
// EXISTING Create mission form unchanged (CreateTaskForm: validation,
// single-flight create, success / error copy). No second form, no
// redesign. Opened from Adult Tasks "New" and Adult Home "New mission".
// The form stays gated by tasks.create, exactly as on the old Assigned view.
export function NewMissionScreen() {
  const household      = useAppStore(selectCurrentHousehold);
  const user           = useAppStore(selectCurrentUser);
  const role           = useAppStore(selectCurrentMemberRole);
  const canCreateTasks = useAppStore(selectCanCreateTasks);
  return (
    <Screen style={styles.screen} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {canCreateTasks && household && user && (
          <CreateTaskForm householdId={household.id} createdByProfileId={user.id} role={role} />
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
});

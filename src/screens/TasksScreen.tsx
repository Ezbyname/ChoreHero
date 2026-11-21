import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { copy } from '@/content/copy';
import { DEFAULT_ADULT_TASK_VIEW, type AdultTaskView } from '@/navigation/roleShell';
import { AssignedByMeScreen } from '@/screens/AssignedByMeScreen';
import { MyTasksScreen } from '@/screens/MyTasksScreen';
import { spacing } from '@/theme';

// Adult Tasks tab (Slice 4, navigation only). It merges the old Assigned
// and My Tasks tabs behind one switch, and both render their current UI
// unchanged:
//   - Assigned: Create task, plus the follow-up list.
//   - My Tasks: tasks assigned to me, with their completion and review
//     actions and sheets.
// No list redesign. Every action stays permission-gated inside each screen.
export function TasksScreen() {
  const [view, setView] = useState<AdultTaskView>(DEFAULT_ADULT_TASK_VIEW);

  const switcher = (
    <View style={styles.switcher} accessibilityRole="tablist" accessibilityLabel={copy.navigation.tasksViewA11y}>
      <AppButton
        label={copy.navigation.tasksViewAssigned}
        variant={view === 'assigned' ? 'primary' : 'secondary'}
        compact
        style={styles.option}
        onPress={() => setView('assigned')}
      />
      <AppButton
        label={copy.navigation.tasksViewMine}
        variant={view === 'mine' ? 'primary' : 'secondary'}
        compact
        style={styles.option}
        onPress={() => setView('mine')}
      />
    </View>
  );

  return view === 'assigned'
    ? <AssignedByMeScreen headerAccessory={switcher} />
    : <MyTasksScreen headerAccessory={switcher} />;
}

const styles = StyleSheet.create({
  switcher: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },
  option: {
    flex: 1,
  },
});

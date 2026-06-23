import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

interface ScreenProps {
  children: React.ReactNode;
  paddingHorizontal?: number;
}

export function Screen({ children, paddingHorizontal = spacing.xl }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={[styles.container, { paddingHorizontal }]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
});

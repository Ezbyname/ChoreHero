import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { copy } from '@/content/copy';
import { syncDiagnostics } from '@/features/sync/householdRefresh';
import { buildSyncDiagnosticsRows } from '@/features/sync/syncDiagnostics';
import { colors, spacing, typography } from '@/theme';

// QA-build-only Settings panel (gated by isSyncDiagnosticsVisible in the
// Settings layout). Read-only: it observes the household sync, never drives
// it. The once-a-second tick only updates the "… ago" ages while visible.
export function SyncDiagnosticsPanel() {
  const snapshot = useSyncExternalStore(syncDiagnostics.subscribe, syncDiagnostics.snapshot);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const rows = buildSyncDiagnosticsRows(snapshot, now);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{copy.syncDiagnostics.sectionTitle}</Text>
      <Card>
        <Text style={styles.hint}>{copy.syncDiagnostics.hint}</Text>
        <View style={styles.grid}>
          {rows.map((r) => (
            <View key={r.label} style={styles.row}>
              <Text style={styles.label}>{r.label}</Text>
              <Text style={styles.value} selectable>{r.value}</Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop:         spacing.lg,
    paddingHorizontal: spacing.xl,
    gap:               spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color:         colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  grid: {
    marginTop: spacing.sm,
    gap:       spacing.xs,
  },
  row: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    gap:            spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  value: {
    ...typography.caption,
    color:     colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
});

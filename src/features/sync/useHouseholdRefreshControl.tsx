import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { refreshHouseholdNow } from '@/features/sync/householdRefresh';
import { colors } from '@/theme';

// Pull-to-refresh for the household data screens (Today, My Tasks,
// Assigned, Rewards) — a manual recovery path, not polling. It goes through
// the SAME scheduler as every other trigger (refreshHouseholdNow), so it
// inherits coalescing, the run timeout and stale-result protection; the
// spinner hides once the scheduler is idle again.
// `alsoRefresh` (optional, Slice 6D): a screen-owned read that is not part
// of household hydration (Adult Family's active invites) runs alongside,
// and the spinner waits for both. Omitted = unchanged behaviour.
export function useHouseholdRefreshControl(alsoRefresh?: () => Promise<unknown>): React.ReactElement<React.ComponentProps<typeof RefreshControl>> {
  const [refreshing, setRefreshing] = useState(false);
  const busyRef    = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const onRefresh = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    void Promise.allSettled([refreshHouseholdNow(), alsoRefresh ? alsoRefresh() : Promise.resolve()]).finally(() => {
      busyRef.current = false;
      if (mountedRef.current) setRefreshing(false);
    });
  }, [alsoRefresh]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );
}

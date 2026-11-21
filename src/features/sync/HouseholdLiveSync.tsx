import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { requestHouseholdRefresh, syncDiagnostics } from '@/features/sync/householdRefresh';
import { nextLiveSyncRunId, openLiveSyncChannel } from '@/features/sync/liveSyncChannel';
import {
  refreshReasonForChannelStatus,
  shouldRebuildChannelOnResume,
  shouldRefreshOnAppStateChange,
} from '@/features/sync/liveSyncRules';
import { useAppStore } from '@/store/useAppStore';

// Keeps the signed-in household's screens current without signing out and
// back in. Renders nothing. Mounted once, inside the hydrated navigator.
//
//   Realtime   postgres_changes on the household's rows (tasks,
//              contribution_claims, reward_redemptions, rewards) — RLS
//              decides which events this user may receive at all. The
//              payload is ignored; every event is only a "refetch" signal.
//   Resubscribe  a (re)connected channel may have missed events -> refetch.
//   Channel trouble  error / timeout / closed -> refetch (throttled); a
//              channel still broken when the app returns to the foreground
//              is rebuilt.
//   Resume     app back in the foreground -> refetch (covers a dropped
//              socket while backgrounded).
// Tab focus is wired in AppTabs; pull-to-refresh, post-mutation and
// stale-decision refetches are requested by the screens / feature wrappers.
// All of them go through the single coalescing scheduler in
// householdRefresh.ts. Every status/event is also recorded for the QA-build
// sync diagnostics panel (observation only).
export function HouseholdLiveSync() {
  const householdId    = useAppStore((s) => s.activeHouseholdId);
  const isAppDataReady = useAppStore((s) => s.isAppDataReady);
  const appStateRef    = useRef<AppStateStatus>(AppState.currentState);
  const lastStatusRef  = useRef<string | null>(null);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const client = supabase;
    if (!client || !householdId || !isAppDataReady) return;

    // A fresh run id per effect run (not the epoch state, which restarts at
    // 0 on a remount): see liveSyncChannel.ts for the vc23 crash this fixes.
    // `epoch` stays a dependency only to force a rebuild on resume.
    let subscribedBefore = false;
    const close = openLiveSyncChannel(client, householdId, nextLiveSyncRunId(), {
      onChange: () => {
        syncDiagnostics.recordRealtimeEvent(Date.now());
        requestHouseholdRefresh('realtime');
      },
      onStatus: (status) => {
        lastStatusRef.current = status;
        syncDiagnostics.recordChannelStatus(status, Date.now());
        const reason = refreshReasonForChannelStatus(status, subscribedBefore);
        if (status === 'SUBSCRIBED') subscribedBefore = true;
        if (reason) requestHouseholdRefresh(reason);
      },
    });

    return () => {
      lastStatusRef.current = null;
      close();
    };
  }, [householdId, isAppDataReady, epoch]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      if (!shouldRefreshOnAppStateChange(previous, next)) return;
      syncDiagnostics.recordResume(Date.now());
      requestHouseholdRefresh('resume');
      if (shouldRebuildChannelOnResume(lastStatusRef.current)) setEpoch((e) => e + 1);
    });
    return () => sub.remove();
  }, []);

  return null;
}

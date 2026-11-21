// Pure rules for HouseholdLiveSync — Node-test safe.

// Must match supabase/migrations/20261030010000_realtime_household_sync.sql.
// task_completion_submissions is intentionally absent: every completion
// transition also changes tasks.status, and submission rows carry a storage
// path clients never need to receive.
export const LIVE_SYNC_TABLES = ['tasks', 'contribution_claims', 'reward_redemptions', 'rewards'] as const;

// Household id only — no user/task identifiers in channel names. A rebuilt
// channel gets a new epoch suffix: realtime-js hands back an EXISTING
// channel object for a topic that is still being removed (removeChannel is
// async), so reusing the old topic could silently re-attach to the dying
// channel instead of joining a new one.
export function liveSyncChannelName(householdId: string, epoch = 0): string {
  return epoch > 0 ? `household-sync:${householdId}:${epoch}` : `household-sync:${householdId}`;
}

// Channel status -> which refresh (if any) it calls for.
//   SUBSCRIBED again  — reconnected; events may have been missed meanwhile.
//   CHANNEL_ERROR / TIMED_OUT / CLOSED — live updates are (temporarily) not
//     arriving; refetch now so the screen is right without them. These are
//     throttled by the scheduler ('channel'), so a flapping socket cannot
//     cause a refresh storm.
export function refreshReasonForChannelStatus(
  status: string,
  subscribedBefore: boolean,
): 'resubscribed' | 'channel' | null {
  if (status === 'SUBSCRIBED') return subscribedBefore ? 'resubscribed' : null;
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') return 'channel';
  return null;
}

// On return to the foreground: a channel whose last status is not
// SUBSCRIBED (still joining counts as healthy) is rebuilt from scratch.
export function shouldRebuildChannelOnResume(lastStatus: string | null): boolean {
  return lastStatus === 'CHANNEL_ERROR' || lastStatus === 'TIMED_OUT' || lastStatus === 'CLOSED';
}

type AppStateLike = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

// Only a real return to the foreground triggers a refetch — not the
// 'inactive' flicker of a system dialog (camera / gallery picker permission
// prompts), which would otherwise refetch mid-flow.
export function shouldRefreshOnAppStateChange(previous: AppStateLike, next: AppStateLike): boolean {
  return next === 'active' && previous === 'background';
}

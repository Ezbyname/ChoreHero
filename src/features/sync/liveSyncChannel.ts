// One household live-sync channel per HouseholdLiveSync effect run.
// Node-test safe (no React Native imports).
//
// vc23: realtime-js `channel(topic)` hands back the EXISTING channel object
// while a channel with that topic is still in the client's list, and a
// removed channel only leaves the list after the server acknowledges the
// unsubscribe (removeChannel is async). The name used to come from React
// state (`epoch`), which starts at 0 again whenever the component remounts —
// an Android activity recreation (font-scale / display-size change) does
// exactly that. The new mount then got the old, already-SUBSCRIBED channel
// and `.on('postgres_changes', …)` threw "cannot add postgres_changes
// callbacks … after subscribe()", killing the app. Each run now takes a
// process-wide unique run id, so a new run can never be handed a channel
// that an earlier run is still removing.
import { LIVE_SYNC_TABLES, liveSyncChannelName } from '@/features/sync/liveSyncRules';

let lastRunId = 0;

// Monotonic for the life of the JS runtime (which is also the life of the
// realtime client, so ids never repeat against a channel the client holds).
export function nextLiveSyncRunId(): number {
  lastRunId += 1;
  return lastRunId;
}

export type LiveSyncChannel = {
  on(
    type: 'postgres_changes',
    filter: { event: '*'; schema: 'public'; table: string; filter: string },
    callback: () => void,
  ): unknown;
  subscribe(callback: (status: string) => void): unknown;
};

export type LiveSyncClient<C extends LiveSyncChannel = LiveSyncChannel> = {
  channel(name: string): C;
  removeChannel(channel: C): Promise<unknown>;
};

// Builds this run's channel: the postgres_changes listeners are attached
// once, BEFORE the single subscribe(). The returned cleanup silences this
// run's status callback (the CLOSED our own removal produces is not channel
// trouble) and removes exactly this run's channel.
export function openLiveSyncChannel<C extends LiveSyncChannel>(
  client: LiveSyncClient<C>,
  householdId: string,
  runId: number,
  handlers: { onChange: () => void; onStatus: (status: string) => void },
): () => void {
  let active = true;
  const channel = client.channel(liveSyncChannelName(householdId, runId));
  for (const table of LIVE_SYNC_TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
      () => { if (active) handlers.onChange(); },
    );
  }
  channel.subscribe((status) => {
    if (!active) return;
    handlers.onStatus(status);
  });
  return () => {
    active = false;
    void client.removeChannel(channel);
  };
}

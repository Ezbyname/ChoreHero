// vc23: HouseholdLiveSync remount safety. The fake client reproduces the
// realtime-js 2.108 rules that crashed vc22 on an Android activity
// recreation (font-scale / display-size change):
//   - channel(topic) returns the EXISTING channel while that topic is still
//     in the client's list (RealtimeClient.channel);
//   - removeChannel() is async: the channel leaves the list only after the
//     server acknowledges the unsubscribe;
//   - on('postgres_changes') on a joined channel throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextLiveSyncRunId, openLiveSyncChannel } from '@/features/sync/liveSyncChannel';
import { LIVE_SYNC_TABLES } from '@/features/sync/liveSyncRules';

type FakeChannel = {
  topic: string;
  joined: boolean;
  onCalls: number;
  subscribeCalls: number;
  statusCb: ((s: string) => void) | null;
  eventCbs: (() => void)[];
  on: (type: 'postgres_changes', filter: unknown, cb: () => void) => FakeChannel;
  subscribe: (cb: (s: string) => void) => FakeChannel;
};

function fakeRealtime() {
  const channels: FakeChannel[] = [];
  const pendingRemovals: (() => void)[] = [];
  const removed: FakeChannel[] = [];
  const client = {
    channel(name: string): FakeChannel {
      const topic = `realtime:${name}`;
      const exists = channels.find((c) => c.topic === topic);
      if (exists) return exists;
      const ch: FakeChannel = {
        topic, joined: false, onCalls: 0, subscribeCalls: 0, statusCb: null, eventCbs: [],
        on(_type, _filter, cb) {
          if (ch.joined) throw new Error(`cannot add \`postgres_changes\` callbacks for ${topic} after \`subscribe()\`.`);
          ch.onCalls += 1;
          ch.eventCbs.push(cb);
          return ch;
        },
        subscribe(cb) {
          ch.subscribeCalls += 1;
          ch.statusCb = cb;
          ch.joined = true;
          cb('SUBSCRIBED');
          return ch;
        },
      };
      channels.push(ch);
      return ch;
    },
    removeChannel(ch: FakeChannel): Promise<unknown> {
      removed.push(ch);
      return new Promise((resolve) => {
        pendingRemovals.push(() => {             // the server's unsubscribe ack
          ch.statusCb?.('CLOSED');
          channels.splice(channels.indexOf(ch), 1);
          resolve('ok');
        });
      });
    },
  };
  const ackAll = () => { while (pendingRemovals.length) pendingRemovals.shift()!(); };
  return { client, channels, removed, ackAll };
}

const noop = { onChange: () => {}, onStatus: () => {} };

test('vc22 collision reproduced: a remount that reuses the topic before removal completes throws', () => {
  const rt = fakeRealtime();
  // vc22 named the channel from `epoch` state, which is 0 again after a remount.
  const closeA = openLiveSyncChannel(rt.client, 'hh-1', 0, noop);
  closeA();                                        // removal still in flight (no ack yet)
  assert.throws(() => openLiveSyncChannel(rt.client, 'hh-1', 0, noop), /cannot add `postgres_changes` callbacks/);
});

test('mount A, immediate cleanup, remount B: distinct channels, no throw, each removes its own', () => {
  const rt = fakeRealtime();
  const a = nextLiveSyncRunId();
  const closeA = openLiveSyncChannel(rt.client, 'hh-1', a, noop);
  const chA = rt.channels[0];
  closeA();                                        // removal of A not yet acknowledged
  const b = nextLiveSyncRunId();
  assert.notEqual(a, b);
  const closeB = openLiveSyncChannel(rt.client, 'hh-1', b, noop);
  const chB = rt.channels[1];
  assert.ok(chB, 'B got a NEW channel object');
  assert.notEqual(chA.topic, chB.topic);
  assert.deepEqual(rt.removed, [chA], 'cleanup A removed exactly channel A');
  rt.ackAll();
  assert.deepEqual(rt.channels, [chB], 'A is gone once acknowledged; B keeps running');
  closeB();
  assert.deepEqual(rt.removed, [chA, chB]);
  rt.ackAll();
  assert.equal(rt.channels.length, 0, 'no leaked channels');
});

test('repeated remounts (activity recreated again and again): unique names, one subscribe and one listener per table each', () => {
  const rt = fakeRealtime();
  const closes: (() => void)[] = [];
  for (let i = 0; i < 25; i++) {
    if (closes.length) closes[closes.length - 1]();  // previous run cleaned up, never acknowledged in time
    closes.push(openLiveSyncChannel(rt.client, 'hh-1', nextLiveSyncRunId(), noop));
  }
  const topics = rt.channels.map((c) => c.topic);
  assert.equal(new Set(topics).size, 25, 'every run got its own topic');
  for (const ch of rt.channels) {
    assert.equal(ch.subscribeCalls, 1, 'subscribed exactly once');
    assert.equal(ch.onCalls, LIVE_SYNC_TABLES.length, 'no duplicate postgres_changes callbacks');
  }
  rt.ackAll();
  assert.equal(rt.channels.length, 1, 'only the current run stays subscribed (no parallel stale subscriptions)');
  closes[closes.length - 1]();
  rt.ackAll();
  assert.equal(rt.channels.length, 0);
});

test('after cleanup a run is silent: its own CLOSED and late events do not reach the app', () => {
  const rt = fakeRealtime();
  const statuses: string[] = [];
  let changes = 0;
  const close = openLiveSyncChannel(rt.client, 'hh-1', nextLiveSyncRunId(), {
    onChange: () => { changes += 1; },
    onStatus: (s) => statuses.push(s),
  });
  const ch = rt.channels[0];
  ch.eventCbs[0]();
  assert.equal(changes, 1);
  close();
  ch.eventCbs[0]();                                  // a late event from the dying channel
  rt.ackAll();                                       // its CLOSED status
  assert.deepEqual(statuses, ['SUBSCRIBED']);
  assert.equal(changes, 1);
});

test('run ids are strictly increasing for the life of the runtime', () => {
  const a = nextLiveSyncRunId();
  const b = nextLiveSyncRunId();
  const c = nextLiveSyncRunId();
  assert.ok(a > 0 && b > a && c > b);
});

test('HouseholdLiveSync takes a fresh run id per effect run (never the remount-reset epoch) and closes its own channel', () => {
  const src = readFileSync(new URL('../HouseholdLiveSync.tsx', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(src.includes('openLiveSyncChannel(client, householdId, nextLiveSyncRunId(), {'));
  assert.ok(!/liveSyncChannelName\([^)]*epoch/.test(src), 'channel name no longer derived from epoch state');
  assert.ok(!src.includes('client.channel('), 'channel creation only via openLiveSyncChannel');
  assert.ok(/return \(\) => \{\s*lastStatusRef\.current = null;\s*close\(\);\s*\};/.test(src));
  assert.ok(src.includes('}, [householdId, isAppDataReady, epoch]);'), 'epoch still forces a rebuild on resume');
});

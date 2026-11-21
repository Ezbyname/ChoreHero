// P0-1/2/3 (Phase 2): the Android refresh wedge. A run that never settles
// (Android's network client has no timeouts) must not block every later
// refresh, and its late result must never overwrite newer data. Also:
// pull-to-refresh, Realtime channel trouble, and the QA diagnostics record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.EXPO_PUBLIC_SUPABASE_URL      = 'https://test.example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';

const {
  createRefreshScheduler, REFRESH_RUN_TIMEOUT_MS, CHANNEL_MIN_INTERVAL_MS, FOCUS_MIN_INTERVAL_MS, REALTIME_DEBOUNCE_MS,
} = await import('@/features/sync/refreshScheduler');
const { refreshHouseholdData }  = await import('@/features/sync/householdRefresh');
const {
  liveSyncChannelName, refreshReasonForChannelStatus, shouldRebuildChannelOnResume,
} = await import('@/features/sync/liveSyncRules');
const {
  createSyncDiagnostics, buildSyncDiagnosticsRows, isSyncDiagnosticsVisible, refreshResultLabel, formatAge,
} = await import('@/features/sync/syncDiagnostics');
const { visibleSettingsSections } = await import('@/screens/settingsLayout');
const { useAppStore }             = await import('@/store/useAppStore');
import type { RefreshReason, RefreshRunContext, RefreshSchedulerEvent } from '@/features/sync/refreshScheduler';

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

function fakeTimers() {
  let t = 1_000_000;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      setTimeout:   (fn: () => void, ms: number) => { const id = nextId++; pending.set(id, { at: t + ms, fn }); return id; },
      clearTimeout: (h: unknown) => { pending.delete(h as number); },
      now:          () => t,
    },
    async advance(ms: number) {
      t += ms;
      for (const [id, p] of [...pending].sort((a, b) => a[1].at - b[1].at)) if (p.at <= t) { pending.delete(id); p.fn(); }
      await flush();
    },
  };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

// Every run hangs until released by hand; contexts are kept for inspection.
function controllableRuns() {
  const runs: Array<{ ctx: RefreshRunContext; release: (v?: unknown) => void }> = [];
  const run = (ctx: RefreshRunContext) => new Promise<unknown>((resolve) => { runs.push({ ctx, release: resolve }); });
  return { run, runs };
}

// ── watchdog: a hung run cannot wedge the queue ─────────────────────────────

test('OLD FAILURE: a run that never settles no longer wedges the queue — every trigger runs again after the timeout', async () => {
  for (const reason of ['realtime', 'focus', 'resume', 'stale', 'mutation', 'manual', 'resubscribed', 'channel'] as RefreshReason[]) {
    const ft = fakeTimers();
    const c  = controllableRuns();
    const s  = createRefreshScheduler(c.run, ft.timers);
    s.request('mutation');
    await ft.advance(0);
    assert.equal(c.runs.length, 1);
    // Before the timeout the hung run is still the one in flight.
    await ft.advance(REFRESH_RUN_TIMEOUT_MS - 1);
    assert.equal(s.request(reason), 'queued', reason);
    // The timeout releases the scheduler; the queued request now runs.
    await ft.advance(1);
    await ft.advance(300);
    assert.equal(c.runs.length, 2, `${reason}: follow-up run after timeout`);
    c.runs[1].release('applied');
    await flush();
    // And a fresh trigger after that still runs normally.
    assert.equal(s.request('mutation'), 'scheduled', reason);
  }
});

test('timeout with nothing queued leaves the scheduler idle and ready (no automatic polling)', async () => {
  const ft = fakeTimers();
  const c  = controllableRuns();
  const s  = createRefreshScheduler(c.run, ft.timers);
  s.request('resume');
  await ft.advance(0);
  await ft.advance(REFRESH_RUN_TIMEOUT_MS);
  await ft.advance(60_000);
  assert.equal(c.runs.length, 1, 'no retry loop on its own');
  assert.equal(s.request('realtime'), 'scheduled');
  await ft.advance(250);
  assert.equal(c.runs.length, 2);
});

test('a timed-out run is told it is stale (isCurrent false) and its request is aborted', async () => {
  const ft = fakeTimers();
  const c  = controllableRuns();
  const s  = createRefreshScheduler(c.run, ft.timers);
  s.request('mutation');
  await ft.advance(0);
  const first = c.runs[0].ctx;
  assert.equal(first.isCurrent(), true);
  assert.equal(first.signal?.aborted, false);
  await ft.advance(REFRESH_RUN_TIMEOUT_MS);
  assert.equal(first.isCurrent(), false);
  assert.equal(first.signal?.aborted, true);
  // Its late settle changes nothing in the scheduler.
  s.request('mutation');
  await ft.advance(0);
  assert.equal(c.runs.length, 2);
  c.runs[0].release('applied');
  await flush();
  assert.equal(c.runs[1].ctx.isCurrent(), true, 'the newer run stays current');
  assert.equal(s.request('mutation'), 'queued', 'newer run still in flight — the late settle did not end it');
});

// ── stale-result protection against the real store ─────────────────────────

const taskRow = (status: string) => ({
  id: 't-1', household_id: 'hh-1', created_by_profile_id: 'owner-1', assignee_profile_id: 'child-1',
  title: 't-1', description: null, due_at: null, due_at_has_time: null, status, points: 5,
});
const ok = <T,>(data: T) => async () => ({ data, error: null });

function seed() {
  useAppStore.setState({
    activeHouseholdId: 'hh-1', isAppDataReady: true, appHydrationState: 'hydrated',
    tasks: [{ id: 't-1', title: 't-1', status: 'needs_attention', householdId: 'hh-1' }],
    taskSubmissions: [], contributionClaims: [], rewardRedemptions: [], rewards: [], pointsBalances: [],
  });
}

test('a late result from a timed-out refresh can NOT overwrite the newer refresh', async () => {
  seed();
  const ft = fakeTimers();
  let releaseOld: (() => void) | null = null;
  let call = 0;
  const signals: Array<AbortSignal | null | undefined> = [];
  const makeDeps = () => ({
    getTasks: (_h: string, o?: { signal?: AbortSignal | null }) => {
      call++;
      signals.push(o?.signal);
      if (call === 1) {
        // The OLD run: server state from before the reject — arrives late.
        return new Promise((r) => { releaseOld = () => r({ data: [taskRow('needs_attention')], error: null }); });
      }
      return Promise.resolve({ data: [taskRow('open')], error: null });
    },
    getRewards: ok([]), getPoints: ok([]), getClaims: ok([]), getRedemptions: ok([]), getSubmissions: ok([]),
    isConfigured: true,
  }) as never;
  const results: unknown[] = [];
  const s = createRefreshScheduler(
    (ctx) => refreshHouseholdData(makeDeps(), ctx).then((r) => { results.push(r); return r; }),
    ft.timers,
  );

  s.request('realtime');                  // adult rejected -> event
  await ft.advance(250);                  // run 1 starts and hangs
  await ft.advance(REFRESH_RUN_TIMEOUT_MS);
  s.request('focus');                     // child switches tab
  await ft.advance(0);                    // run 2: 'open' applied
  assert.equal(useAppStore.getState().tasks[0].status, 'open');

  releaseOld!();                          // the hung request finally answers
  await flush();
  assert.equal(useAppStore.getState().tasks[0].status, 'open', 'old needs_attention must not come back');
  assert.deepEqual(results, ['applied', 'dropped']);
  assert.ok(signals[0] instanceof AbortSignal && signals[0].aborted, 'the hung request was aborted');
});

test('refreshHouseholdData passes the abort signal to every abortable query', async () => {
  seed();
  const seen: string[] = [];
  const ctl = new AbortController();
  const rec = (name: string) => async (_h: string, o?: { signal?: AbortSignal | null }) => {
    if (o?.signal === ctl.signal) seen.push(name);
    return { data: name === 'tasks' ? [taskRow('open')] : [], error: null };
  };
  const r = await refreshHouseholdData({
    getTasks: rec('tasks'), getRewards: rec('rewards'), getPoints: rec('points'), getClaims: rec('claims'),
    getRedemptions: rec('redemptions'), getSubmissions: ok([]), isConfigured: true,
  } as never, { signal: ctl.signal, isCurrent: () => true });
  assert.equal(r, 'applied');
  assert.deepEqual(seen.sort(), ['claims', 'points', 'redemptions', 'rewards', 'tasks']);
});

test('coalescing still works: a burst becomes one run; requests during a run become one follow-up', async () => {
  const ft = fakeTimers();
  const c  = controllableRuns();
  const s  = createRefreshScheduler(c.run, ft.timers);
  assert.equal(s.request('realtime'), 'scheduled');
  assert.equal(s.request('realtime'), 'coalesced');
  assert.equal(s.request('manual'), 'coalesced');
  await ft.advance(250);
  assert.equal(c.runs.length, 1);
  s.request('realtime'); s.request('focus'); s.request('stale');
  c.runs[0].release('applied');
  await flush();
  assert.equal(c.runs.length, 2);
  c.runs[1].release('applied');
  await flush();
  assert.equal(c.runs.length, 2);
});

// ── manual (pull-to-refresh) ────────────────────────────────────────────────

test('manual refresh is never throttled and goes through the scheduler; whenIdle ends the spinner', async () => {
  const ft = fakeTimers();
  const c  = controllableRuns();
  const s  = createRefreshScheduler(c.run, ft.timers);
  s.markFresh();
  assert.equal(s.request('focus'), 'throttled');
  assert.equal(s.request('manual'), 'scheduled');
  let idle = false;
  void s.whenIdle().then(() => { idle = true; });
  await ft.advance(0);
  assert.equal(c.runs.length, 1);
  assert.equal(idle, false);
  c.runs[0].release('applied');
  await flush();
  assert.equal(idle, true);
  await s.whenIdle(); // already idle -> resolves immediately
});

test('pull-to-refresh spinner also ends when the run hangs (after the timeout)', async () => {
  const ft = fakeTimers();
  const c  = controllableRuns();
  const s  = createRefreshScheduler(c.run, ft.timers);
  s.request('manual');
  let idle = false;
  void s.whenIdle().then(() => { idle = true; });
  await ft.advance(0);
  await ft.advance(REFRESH_RUN_TIMEOUT_MS - 1);
  assert.equal(idle, false);
  await ft.advance(1);
  assert.equal(idle, true);
});

test('pull-to-refresh is wired to the SAME scheduler on Today, My Tasks (also when empty), Assigned and Rewards', () => {
  const refresh = code('../householdRefresh.ts');
  assert.ok(/export function refreshHouseholdNow\(\): Promise<void> \{\s*scheduler\.request\('manual'\);\s*return scheduler\.whenIdle\(\);/.test(refresh));
  const hook = code('../useHouseholdRefreshControl.tsx');
  assert.ok(hook.includes('refreshHouseholdNow()'));
  assert.ok(!/from '@\/lib\/repositories'/.test(hook), 'no independent fetch path');
  for (const screen of ['TodayScreen', 'MyTasksScreen', 'AssignedByMeScreen', 'RewardsScreen']) {
    const src = code(`../../../screens/${screen}.tsx`);
    assert.ok(src.includes('const refreshControl = useHouseholdRefreshControl();'), screen);
    assert.ok(src.includes('refreshControl={refreshControl}'), screen);
  }
  const myTasks = code('../../../screens/MyTasksScreen.tsx');
  assert.equal((myTasks.match(/refreshControl=\{refreshControl\}/g) ?? []).length, 2, 'empty state is pullable too');
});

// ── Realtime channel trouble ────────────────────────────────────────────────

test('channel error / timeout / closed request a recovery refresh; first SUBSCRIBED does not, a re-SUBSCRIBED does', () => {
  assert.equal(refreshReasonForChannelStatus('CHANNEL_ERROR', true), 'channel');
  assert.equal(refreshReasonForChannelStatus('TIMED_OUT', false), 'channel');
  assert.equal(refreshReasonForChannelStatus('CLOSED', true), 'channel');
  assert.equal(refreshReasonForChannelStatus('SUBSCRIBED', false), null);
  assert.equal(refreshReasonForChannelStatus('SUBSCRIBED', true), 'resubscribed');
  assert.equal(shouldRebuildChannelOnResume('CLOSED'), true);
  assert.equal(shouldRebuildChannelOnResume('TIMED_OUT'), true);
  assert.equal(shouldRebuildChannelOnResume('CHANNEL_ERROR'), true);
  assert.equal(shouldRebuildChannelOnResume('SUBSCRIBED'), false);
  assert.equal(shouldRebuildChannelOnResume(null), false);
  assert.equal(liveSyncChannelName('hh-1'), 'household-sync:hh-1');
  assert.equal(liveSyncChannelName('hh-1', 2), 'household-sync:hh-1:2', 'a rebuilt channel never reuses a dying topic');
});

test('no refresh storm: a flapping channel refreshes at most once per interval', async () => {
  const ft = fakeTimers();
  const c  = controllableRuns();
  const s  = createRefreshScheduler(c.run, ft.timers);
  assert.equal(s.request('channel'), 'scheduled');
  await ft.advance(0);
  c.runs[0].release('failed');
  await flush();
  for (let i = 0; i < 20; i++) {
    await ft.advance(400);
    assert.equal(s.request('channel'), 'throttled');
  }
  assert.equal(c.runs.length, 1);
  await ft.advance(CHANNEL_MIN_INTERVAL_MS);
  assert.equal(s.request('channel'), 'scheduled');
  // A real change is never blocked by the channel throttle.
  await ft.advance(0);
  c.runs[1].release('applied');
  await flush();
  assert.equal(s.request('realtime'), 'scheduled');
});

test('FOREGROUND ONLY (no resume): CHANNEL_ERROR / TIMED_OUT / CLOSED recover the data, survive a hung run, never storm', async () => {
  // Drives the SAME status -> reason mapping HouseholdLiveSync's subscribe
  // callback uses, into the real scheduler, real refreshHouseholdData and the
  // real store. The app never leaves the foreground in this test.
  seed();                                              // child sees stale 'needs_attention'
  const ft = fakeTimers();
  let server = 'open';                                 // backend truth
  let hangNext = false;
  let calls = 0;
  const deps = {
    getTasks: () => {
      calls++;
      if (hangNext) { hangNext = false; return new Promise(() => {}); }   // Android: no network timeout
      return Promise.resolve({ data: [taskRow(server)], error: null });
    },
    getRewards: ok([]), getPoints: ok([]), getClaims: ok([]), getRedemptions: ok([]), getSubmissions: ok([]),
    isConfigured: true,
  } as never;
  const s = createRefreshScheduler((ctx) => refreshHouseholdData(deps, ctx), ft.timers);
  let subscribedBefore = false;
  const onStatus = (status: string) => {               // == HouseholdLiveSync's callback
    const reason = refreshReasonForChannelStatus(status, subscribedBefore);
    if (status === 'SUBSCRIBED') subscribedBefore = true;
    return reason ? s.request(reason) : null;
  };
  const status = () => useAppStore.getState().tasks[0].status;

  assert.equal(onStatus('SUBSCRIBED'), null);          // first join: hydration already loaded data

  // 1. CHANNEL_ERROR -> immediate recovery refresh -> no longer stale.
  assert.equal(onStatus('CHANNEL_ERROR'), 'scheduled');
  await ft.advance(0);
  assert.equal(status(), 'open');

  // 2. Flapping (TIMED_OUT / CHANNEL_ERROR every 400 ms) -> throttled, no storm.
  server = 'needs_attention';
  for (let i = 0; i < 20; i++) {
    await ft.advance(400);
    assert.equal(onStatus(i % 2 ? 'TIMED_OUT' : 'CHANNEL_ERROR'), 'throttled');
  }
  assert.equal(calls, 1);
  // ...but a real change / the library's own rejoin still refresh right away.
  assert.equal(onStatus('SUBSCRIBED'), 'scheduled', 're-SUBSCRIBED after rejoin = resubscribed refresh');
  await ft.advance(0);
  assert.equal(status(), 'needs_attention');

  // 3. CLOSED (server closed the channel, no auto-rejoin) whose refresh HANGS.
  await ft.advance(CHANNEL_MIN_INTERVAL_MS);
  server = 'open';
  hangNext = true;
  assert.equal(onStatus('CLOSED'), 'scheduled');
  await ft.advance(0);
  assert.equal(s.request('manual'), 'queued', 'pull-to-refresh during the hung run is kept, not lost');
  await ft.advance(REFRESH_RUN_TIMEOUT_MS);            // watchdog fires -> queued manual runs
  assert.equal(status(), 'open', 'not permanently stale: recovered while still foregrounded');

  // 4. The scheduler stays usable for every later trigger.
  for (const [reason, next] of [['focus', 'needs_attention'], ['manual', 'open'], ['resume', 'needs_attention'], ['stale', 'open'], ['realtime', 'needs_attention']] as const) {
    await ft.advance(FOCUS_MIN_INTERVAL_MS);
    server = next;
    assert.equal(s.request(reason), 'scheduled', reason);
    await ft.advance(REALTIME_DEBOUNCE_MS);
    assert.equal(status(), next, `${reason} refresh applied`);
  }
  // 5. Channel trouble can still recover again later (throttle is per interval, not one-shot).
  await ft.advance(CHANNEL_MIN_INTERVAL_MS);
  server = 'open';
  assert.equal(onStatus('CLOSED'), 'scheduled');
  await ft.advance(0);
  assert.equal(status(), 'open');
});

test('HouseholdLiveSync wiring: statuses drive recovery, our own cleanup CLOSED is ignored, resume rebuilds a broken channel', () => {
  const src = code('../HouseholdLiveSync.tsx');
  // vc23: channel setup lives in liveSyncChannel.ts (own run id per effect run).
  const chan = code('../liveSyncChannel.ts');
  assert.ok(/channel\.subscribe\(\(status\) => \{\s*if \(!active\) return;/.test(chan));
  assert.ok(src.includes('refreshReasonForChannelStatus(status, subscribedBefore)'));
  assert.ok(/return \(\) => \{\s*active = false;/.test(chan));
  assert.ok(/requestHouseholdRefresh\('resume'\);\s*if \(shouldRebuildChannelOnResume\(lastStatusRef\.current\)\) setEpoch/.test(src));
  assert.ok(src.includes('openLiveSyncChannel(client, householdId, nextLiveSyncRunId(), {'));
  assert.ok(chan.includes('client.channel(liveSyncChannelName(householdId, runId))'));
  assert.ok(/syncDiagnostics\.recordRealtimeEvent\(Date\.now\(\)\);\s*requestHouseholdRefresh\('realtime'\);/.test(src));
});

// ── QA diagnostics ──────────────────────────────────────────────────────────

test('diagnostics record start / end / timeout / queued requests and channel trouble', async () => {
  const d  = createSyncDiagnostics();
  const ft = fakeTimers();
  const c  = controllableRuns();
  const s  = createRefreshScheduler(c.run, ft.timers, { onEvent: d.recordScheduler });
  s.request('realtime');
  await ft.advance(250);
  assert.equal(d.snapshot().refreshRunning, true);
  assert.deepEqual(d.snapshot().refreshReasons, ['realtime']);
  s.request('focus'); s.request('stale');
  assert.equal(d.snapshot().queuedRequests, 2);
  await ft.advance(REFRESH_RUN_TIMEOUT_MS);
  let snap = d.snapshot();
  assert.equal(snap.lastRefreshResult, 'timeout');
  assert.equal(snap.timeoutCount, 1);
  assert.equal(snap.lastRefreshDurationMs, REFRESH_RUN_TIMEOUT_MS);
  // the queued follow-up started at once
  assert.equal(snap.refreshRunning, true);
  assert.deepEqual(snap.refreshReasons.sort(), ['focus', 'stale']);
  c.runs[1].release('applied');
  await flush();
  snap = d.snapshot();
  assert.equal(snap.refreshRunning, false);
  assert.equal(snap.lastRefreshResult, 'success');
  assert.equal(snap.refreshCount, 2);
  d.recordChannelStatus('SUBSCRIBED', 1); d.recordChannelStatus('CHANNEL_ERROR', 2); d.recordChannelStatus('CLOSED', 3);
  d.recordRealtimeEvent(4); d.recordRealtimeEvent(5);
  snap = d.snapshot();
  assert.equal(snap.channelStatus, 'CLOSED');
  assert.equal(snap.channelProblems, 2);
  assert.equal(snap.realtimeEvents, 2);
  assert.equal(refreshResultLabel('failed'), 'failed');
  assert.equal(refreshResultLabel('error'), 'failed');
  assert.equal(refreshResultLabel('applied'), 'success');
});

test('diagnostics never change behaviour: a throwing listener / onEvent cannot break sync', async () => {
  const ft = fakeTimers();
  const c  = controllableRuns();
  const s  = createRefreshScheduler(c.run, ft.timers, { onEvent: () => { throw new Error('boom'); } });
  s.request('mutation');
  await ft.advance(0);
  c.runs[0].release('applied');
  await flush();
  assert.equal(s.request('mutation'), 'scheduled');
  const d = createSyncDiagnostics();
  d.subscribe(() => { throw new Error('listener'); });
  d.recordRealtimeEvent(1);
  assert.equal(d.snapshot().realtimeEvents, 1);
});

test('diagnostics show no identifiers, tokens, URLs or paths — only statuses, counts and ages', () => {
  const d = createSyncDiagnostics();
  d.recordChannelStatus('SUBSCRIBED', 1000);
  d.recordScheduler({ type: 'start', runId: 1, reasons: ['realtime'], at: 2000 } as RefreshSchedulerEvent);
  d.recordScheduler({ type: 'end', runId: 1, result: 'applied', durationMs: 640, at: 2640 } as RefreshSchedulerEvent);
  const text = JSON.stringify(buildSyncDiagnosticsRows(d.snapshot(), 10_000));
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(text), 'no uuids');
  assert.ok(!/https?:|supabase|eyJ|household-sync|[\w-]+\/[\w-]+/i.test(text), 'no urls / tokens / topics / paths');
  assert.ok(text.includes('success · 0.6 s'));
  assert.equal(formatAge(null, 1), '—');
  assert.equal(formatAge(1000, 13_000), '12 s ago');
});

test('diagnostics panel is QA-build only; Sign Out stays last', () => {
  assert.equal(isSyncDiagnosticsVisible('qa'), true);
  for (const v of ['production', 'development', null, undefined, '']) assert.equal(isSyncDiagnosticsVisible(v), false, String(v));
  const qa = visibleSettingsSections({ isAuthenticated: true, hasActiveHousehold: true, canInviteMembers: true, showSyncDiagnostics: true });
  assert.ok(qa.includes('syncDiagnostics'));
  assert.equal(qa.at(-1), 'session');
  const prod = visibleSettingsSections({ isAuthenticated: true, hasActiveHousehold: true, canInviteMembers: true });
  assert.ok(!prod.includes('syncDiagnostics'));
  const settings = code('../../../screens/SettingsScreen.tsx');
  assert.ok(settings.includes('showSyncDiagnostics: isSyncDiagnosticsVisible(currentBuildInfo.appVariant)'));
  const refresh = code('../householdRefresh.ts');
  assert.ok(refresh.includes('{ onEvent: syncDiagnostics.recordScheduler }'));
});

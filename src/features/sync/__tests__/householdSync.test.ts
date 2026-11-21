// Realtime + refetch: the coalescing scheduler, the refresh itself, and the
// live-sync rules. Configured mode with fake repositories (same pattern as
// approveTaskCompletionSubmission.refresh.test.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.EXPO_PUBLIC_SUPABASE_URL      = 'https://test.example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-test-anon-key-not-a-real-credential';

const { createRefreshScheduler }                           = await import('@/features/sync/refreshScheduler');
const { refreshHouseholdData }                             = await import('@/features/sync/householdRefresh');
const { LIVE_SYNC_TABLES, liveSyncChannelName, shouldRefreshOnAppStateChange } = await import('@/features/sync/liveSyncRules');
const { useAppStore }                                      = await import('@/store/useAppStore');
import type { PostgrestError } from '@supabase/supabase-js';

// ── fake timers ─────────────────────────────────────────────────────────────
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
      for (const [id, p] of [...pending]) if (p.at <= t) { pending.delete(id); p.fn(); }
      await flush();
    },
    pendingCount: () => pending.size,
  };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function deferredRun() {
  let runs = 0;
  let release: (() => void) | null = null;
  const run = () => { runs++; return new Promise<void>((r) => { release = r; }); };
  return { run, runs: () => runs, finish: async () => { release?.(); release = null; await flush(); } };
}

// ── scheduler ───────────────────────────────────────────────────────────────

test('realtime burst (insert + update + duplicate delivery) collapses into ONE refresh', async () => {
  const ft = fakeTimers();
  const d  = deferredRun();
  const s  = createRefreshScheduler(d.run, ft.timers);
  assert.equal(s.request('realtime'), 'scheduled');
  assert.equal(s.request('realtime'), 'coalesced');
  assert.equal(s.request('realtime'), 'coalesced');
  await ft.advance(249);
  assert.equal(d.runs(), 0);
  await ft.advance(1);
  assert.equal(d.runs(), 1);
  await d.finish();
  assert.equal(d.runs(), 1);
});

test('events during an in-flight refresh are never lost: exactly one follow-up run', async () => {
  const ft = fakeTimers();
  const d  = deferredRun();
  const s  = createRefreshScheduler(d.run, ft.timers);
  s.request('mutation');
  await ft.advance(0);
  assert.equal(d.runs(), 1);
  assert.equal(s.request('realtime'), 'queued');
  assert.equal(s.request('realtime'), 'queued');
  assert.equal(s.request('stale'), 'queued');
  await d.finish();
  assert.equal(d.runs(), 2);
  await d.finish();
  assert.equal(d.runs(), 2);
});

test('mutation / stale / resume refresh immediately; realtime waits for the debounce', async () => {
  for (const reason of ['mutation', 'stale', 'resume', 'resubscribed'] as const) {
    const ft = fakeTimers();
    const d  = deferredRun();
    createRefreshScheduler(d.run, ft.timers).request(reason);
    await ft.advance(0);
    assert.equal(d.runs(), 1, reason);
  }
});

test('focus refresh is throttled right after fresh data, then allowed again', async () => {
  const ft = fakeTimers();
  const d  = deferredRun();
  const s  = createRefreshScheduler(d.run, ft.timers);
  s.markFresh(); // initial hydration just happened
  assert.equal(s.request('focus'), 'throttled');
  await ft.advance(4000);
  assert.equal(s.request('focus'), 'scheduled');
  await ft.advance(0);
  assert.equal(d.runs(), 1);
  await d.finish();
  assert.equal(s.request('focus'), 'throttled');
  // A real change is never throttled.
  assert.equal(s.request('realtime'), 'scheduled');
});

test('a failing / throwing run does not wedge the scheduler', async () => {
  const ft = fakeTimers();
  let runs = 0;
  const s = createRefreshScheduler(() => { runs++; if (runs === 1) throw new Error('boom'); return Promise.reject(new Error('x')); }, ft.timers);
  s.request('mutation');
  await ft.advance(0);
  s.request('mutation');
  await ft.advance(0);
  s.request('mutation');
  await ft.advance(0);
  assert.equal(runs, 3);
});

test('dispose cancels a pending refresh and ignores later requests', async () => {
  const ft = fakeTimers();
  const d  = deferredRun();
  const s  = createRefreshScheduler(d.run, ft.timers);
  s.request('realtime');
  s.dispose();
  await ft.advance(1000);
  assert.equal(d.runs(), 0);
  assert.equal(s.request('mutation'), 'disposed');
});

// ── refresh ─────────────────────────────────────────────────────────────────

const pgErr = { code: 'PGRST500', message: 'x', details: '', hint: '' } as PostgrestError;
const taskRow = (id: string, status: string) => ({
  id, household_id: 'hh-1', created_by_profile_id: 'owner-1', assignee_profile_id: 'child-1',
  title: id, description: null, due_at: null, due_at_has_time: null, status, points: 5,
});
const subRow = (id: string, task: string, status: string, photo_count = 0) => ({
  id, task_id: task, status, submitted_by_profile_id: 'child-1', submitted_at: '2026-10-30T10:00:00Z', reviewed_at: null, photo_count,
});

function seed() {
  useAppStore.setState({
    activeHouseholdId: 'hh-1', isAppDataReady: true, appHydrationState: 'hydrated',
    tasks: [{ id: 't-1', title: 't-1', status: 'open', householdId: 'hh-1' }],
    taskSubmissions: [], contributionClaims: [], rewardRedemptions: [], rewards: [], pointsBalances: [],
  });
}

function deps(over: Partial<Record<string, unknown>> = {}) {
  return {
    getTasks:       async () => ({ data: [taskRow('t-1', 'needs_attention')], error: null }),
    getRewards:     async () => ({ data: [], error: null }),
    getPoints:      async () => ({ data: [], error: null }),
    getClaims:      async () => ({ data: [], error: null }),
    getRedemptions: async () => ({ data: [], error: null }),
    getSubmissions: async () => ({ data: [subRow('s-1', 't-1', 'pending', 3)], error: null }),
    isConfigured:   true,
    ...over,
  } as never;
}

test('realtime insertion: a new pending submission appears for the reviewer without re-login', async () => {
  seed();
  const hydrationBefore = useAppStore.getState().appHydrationState;
  assert.equal(await refreshHouseholdData(deps()), 'applied');
  const s = useAppStore.getState();
  assert.equal(s.tasks[0].status, 'needs_attention');
  assert.deepEqual(s.taskSubmissions.map((x) => [x.id, x.status, x.photoCount]), [['s-1', 'pending', 3]]);
  // Background refresh never re-enters hydration (no loading screen).
  assert.equal(s.appHydrationState, hydrationBefore);
  assert.equal(s.isAppDataReady, true);
});

test('realtime withdrawal / approve: the pending item disappears (lists are replaced, never appended)', async () => {
  seed();
  await refreshHouseholdData(deps());
  await refreshHouseholdData(deps({
    getTasks:       async () => ({ data: [taskRow('t-1', 'open')], error: null }),
    getSubmissions: async () => ({ data: [subRow('s-1', 't-1', 'withdrawn', 3)], error: null }),
  }));
  let s = useAppStore.getState();
  assert.equal(s.tasks.length, 1);
  assert.equal(s.tasks[0].status, 'open');
  assert.equal(s.taskSubmissions.filter((x) => x.status === 'pending').length, 0);
  await refreshHouseholdData(deps({ getTasks: async () => ({ data: [taskRow('t-1', 'completed')], error: null }) }));
  s = useAppStore.getState();
  assert.equal(s.tasks[0].status, 'completed');
});

test('duplicate event delivery: refreshing twice with the same server state yields no duplicate cards', async () => {
  seed();
  await refreshHouseholdData(deps());
  await refreshHouseholdData(deps());
  const s = useAppStore.getState();
  assert.equal(s.tasks.length, 1);
  assert.equal(s.taskSubmissions.length, 1);
});

test('a failed required fetch keeps the current data; a failed metadata fetch keeps old metadata', async () => {
  seed();
  await refreshHouseholdData(deps());
  assert.equal(await refreshHouseholdData(deps({ getTasks: async () => ({ data: null, error: pgErr }) })), 'failed');
  assert.equal(useAppStore.getState().tasks[0].status, 'needs_attention');
  assert.equal(await refreshHouseholdData(deps({
    getTasks:       async () => ({ data: [taskRow('t-1', 'open')], error: null }),
    getSubmissions: async () => ({ data: null, error: pgErr }),
  })), 'applied');
  assert.equal(useAppStore.getState().tasks[0].status, 'open');
  assert.equal(useAppStore.getState().taskSubmissions.length, 1);
});

test('a result that lands after sign-out / household switch is dropped', async () => {
  seed();
  let release: (() => void) | null = null;
  const pending = refreshHouseholdData(deps({
    getTasks: () => new Promise((r) => { release = () => r({ data: [taskRow('t-1', 'completed')], error: null }); }),
  }));
  await flush();
  useAppStore.setState({ activeHouseholdId: 'hh-OTHER' });
  release!();
  assert.equal(await pending, 'dropped');
  assert.equal(useAppStore.getState().tasks[0].status, 'open');
});

test('skipped in mock mode, when not hydrated, or with no household', async () => {
  seed();
  assert.equal(await refreshHouseholdData(deps({ isConfigured: false })), 'skipped');
  useAppStore.setState({ isAppDataReady: false });
  assert.equal(await refreshHouseholdData(deps()), 'skipped');
  useAppStore.setState({ isAppDataReady: true, activeHouseholdId: null });
  assert.equal(await refreshHouseholdData(deps()), 'skipped');
});

// ── live-sync rules ─────────────────────────────────────────────────────────

test('app resume: only background -> active refreshes (not the picker/permission inactive flicker)', () => {
  assert.equal(shouldRefreshOnAppStateChange('background', 'active'), true);
  assert.equal(shouldRefreshOnAppStateChange('inactive', 'active'), false);
  assert.equal(shouldRefreshOnAppStateChange('active', 'background'), false);
  assert.equal(shouldRefreshOnAppStateChange('active', 'inactive'), false);
});

test('Realtime tables match the publication migration; submissions (paths) are not subscribed', () => {
  const sql = readFileSync(new URL('../../../../supabase/migrations/20261030010000_realtime_household_sync.sql', import.meta.url), 'utf8');
  for (const t of LIVE_SYNC_TABLES) assert.ok(sql.includes(`'${t}'`), t);
  assert.ok(!(LIVE_SYNC_TABLES as readonly string[]).includes('task_completion_submissions'));
  assert.equal(liveSyncChannelName('hh-1'), 'household-sync:hh-1');
});

test('post-mutation paths never call the full re-hydration any more', () => {
  for (const file of [
    '../../tasks/approveTaskCompletionSubmission.ts',
    '../../tasks/rejectTaskCompletionSubmission.ts',
    '../../tasks/childPendingCompletion.ts',
    '../../../screens/TodayScreen.tsx',
    '../../../screens/MyTasksScreen.tsx',
  ]) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!code.includes('requestAppDataHydrationRetry'), file);
  }
});

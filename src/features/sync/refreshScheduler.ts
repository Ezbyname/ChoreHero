// Pure coalescing scheduler for background household refreshes. No React,
// no Supabase, no timers of its own (injected) — Node-test safe.
//
// Every trigger (Realtime event, channel trouble, tab focus, app resume, a
// mutation's own follow-up, a stale-decision response, pull-to-refresh)
// asks for "a refresh soon". The scheduler guarantees:
//   - at most ONE refresh in flight at a time;
//   - a burst of requests (Realtime often delivers several events for one
//     approve — task row, then points) collapses into a single run;
//   - a request that arrives while a run is in flight is never lost: exactly
//     one follow-up run starts after the current one finishes, so the last
//     change is always fetched;
//   - tab-focus and channel-trouble requests are throttled, so flipping
//     between tabs or a flapping socket doesn't refetch on every signal;
//   - a failed run never wedges the scheduler;
//   - a run that NEVER settles never wedges it either. On Android the
//     network client has no timeouts at all (React Native's OkHttp client
//     uses 0 = infinite), so one request on a dead connection could hang
//     forever and, before this watchdog, every later refresh queued behind
//     it until the app was restarted. After runTimeoutMs the run is
//     abandoned: its AbortSignal fires (best-effort cancel) and it is no
//     longer "current", so a late result can never be applied over newer
//     data (the run checks ctx.isCurrent() before writing anything).
// Because a run replaces whole lists from the server (never appends), the
// same event delivered twice cannot produce duplicate cards.

export type RefreshReason =
  | 'realtime'      // postgres_changes event
  | 'resubscribed'  // channel (re)connected — events may have been missed
  | 'channel'       // channel error / timeout / closed — events may be missed
  | 'focus'         // a tab gained focus
  | 'resume'        // app returned to the foreground
  | 'mutation'      // this device just changed something
  | 'stale'         // the server said "no longer pending" — screen is stale
  | 'manual';       // pull-to-refresh

export type SchedulerTimers = {
  setTimeout:   (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now:          () => number;
};

export type RefreshRequestOutcome = 'scheduled' | 'coalesced' | 'queued' | 'throttled' | 'disposed';

// Handed to every run. isCurrent() turns false once the run has timed out
// (or the scheduler was disposed): from then on its result must be ignored.
export type RefreshRunContext = {
  signal:    AbortSignal | null;
  isCurrent: () => boolean;
};

// Observability only (QA sync diagnostics). Never influences scheduling.
export type RefreshSchedulerEvent =
  | { type: 'request'; reason: RefreshReason; outcome: RefreshRequestOutcome; at: number }
  | { type: 'start';   runId: number; reasons: RefreshReason[]; at: number }
  // result: the run's own resolved value when it is a string, else 'error'
  // for a rejected/throwing run, 'done' for any other value.
  | { type: 'end';     runId: number; result: string; durationMs: number; at: number }
  | { type: 'timeout'; runId: number; durationMs: number; at: number };

export type RefreshScheduler = {
  request:   (reason: RefreshReason) => RefreshRequestOutcome;
  // Data was just loaded by other means (initial hydration) — counts as a
  // fresh refresh for focus throttling.
  markFresh: () => void;
  // Resolves once nothing is scheduled or running (pull-to-refresh waits
  // on this to hide its spinner). Resolves immediately when already idle.
  whenIdle:  () => Promise<void>;
  dispose:   () => void;
};

export const REALTIME_DEBOUNCE_MS     = 250;
export const FOCUS_MIN_INTERVAL_MS    = 4000;
export const CHANNEL_MIN_INTERVAL_MS  = 10000;
export const REFRESH_RUN_TIMEOUT_MS   = 15000;

export function createRefreshScheduler(
  run: (ctx: RefreshRunContext) => Promise<unknown>,
  timers: SchedulerTimers,
  opts: {
    realtimeDebounceMs?:   number;
    focusMinIntervalMs?:   number;
    channelMinIntervalMs?: number;
    runTimeoutMs?:         number;
    onEvent?:              (event: RefreshSchedulerEvent) => void;
  } = {},
): RefreshScheduler {
  const debounceMs        = opts.realtimeDebounceMs   ?? REALTIME_DEBOUNCE_MS;
  const focusIntervalMs   = opts.focusMinIntervalMs   ?? FOCUS_MIN_INTERVAL_MS;
  const channelIntervalMs = opts.channelMinIntervalMs ?? CHANNEL_MIN_INTERVAL_MS;
  const runTimeoutMs      = opts.runTimeoutMs         ?? REFRESH_RUN_TIMEOUT_MS;

  let timer: unknown    = null;
  let watchdog: unknown = null;
  let inFlight          = false;
  let rerun             = false;
  let disposed          = false;
  let lastFreshAt       = Number.NEGATIVE_INFINITY;
  let lastChannelAt     = Number.NEGATIVE_INFINITY;
  // Identifies the one run whose result may still be applied.
  let generation        = 0;
  let controller: AbortController | null = null;
  let pendingReasons: RefreshReason[] = [];
  let idleWaiters: Array<() => void>  = [];

  const emit = (event: RefreshSchedulerEvent) => {
    try { opts.onEvent?.(event); } catch { /* diagnostics must never break sync */ }
  };

  function notifyIdle() {
    if (inFlight || timer !== null) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function afterRun() {
    if (rerun && !disposed) {
      rerun = false;
      start();
    } else {
      notifyIdle();
    }
  }

  function start() {
    timer = null;
    if (disposed) { notifyIdle(); return; }
    generation += 1;
    const runId     = generation;
    const startedAt = timers.now();
    inFlight    = true;
    lastFreshAt = startedAt;
    controller  = typeof AbortController === 'function' ? new AbortController() : null;
    const ctx: RefreshRunContext = {
      signal:    controller?.signal ?? null,
      isCurrent: () => !disposed && runId === generation && inFlight,
    };
    emit({ type: 'start', runId, reasons: pendingReasons, at: startedAt });
    pendingReasons = [];

    watchdog = timers.setTimeout(() => {
      watchdog = null;
      if (runId !== generation || !inFlight) return;
      // Abandon the hung run: it is no longer current, so whatever it
      // returns later is ignored; later requests run normally.
      generation += 1;
      inFlight = false;
      try { controller?.abort(); } catch { /* best effort */ }
      controller = null;
      emit({ type: 'timeout', runId, durationMs: timers.now() - startedAt, at: timers.now() });
      afterRun();
    }, runTimeoutMs);

    let settled: Promise<unknown>;
    try {
      settled = Promise.resolve(run(ctx));
    } catch (e) {
      settled = Promise.reject(e);
    }
    settled
      .then((value) => (typeof value === 'string' ? value : 'done'), () => 'error')
      .then((result) => {
        // Timed out (or disposed) meanwhile: the scheduler already moved on.
        if (runId !== generation || !inFlight) return;
        if (watchdog !== null) { timers.clearTimeout(watchdog); watchdog = null; }
        inFlight   = false;
        controller = null;
        emit({ type: 'end', runId, result, durationMs: timers.now() - startedAt, at: timers.now() });
        afterRun();
      });
  }

  function decide(reason: RefreshReason): RefreshRequestOutcome {
    if (disposed) return 'disposed';
    const now = timers.now();
    if (reason === 'focus' && !inFlight && timer === null && now - lastFreshAt < focusIntervalMs) {
      return 'throttled';
    }
    if (reason === 'channel') {
      if (now - lastChannelAt < channelIntervalMs) return 'throttled';
      lastChannelAt = now;
    }
    if (!pendingReasons.includes(reason)) pendingReasons.push(reason);
    if (inFlight) {
      rerun = true;
      return 'queued';
    }
    if (timer !== null) return 'coalesced';
    timer = timers.setTimeout(start, reason === 'realtime' ? debounceMs : 0);
    return 'scheduled';
  }

  return {
    request(reason) {
      const outcome = decide(reason);
      emit({ type: 'request', reason, outcome, at: timers.now() });
      return outcome;
    },
    markFresh() {
      lastFreshAt = timers.now();
    },
    whenIdle() {
      if (!inFlight && timer === null) return Promise.resolve();
      return new Promise<void>((resolve) => { idleWaiters.push(resolve); });
    },
    dispose() {
      disposed = true;
      generation += 1;
      if (timer !== null) timers.clearTimeout(timer);
      if (watchdog !== null) timers.clearTimeout(watchdog);
      timer = null;
      watchdog = null;
      inFlight = false;
      try { controller?.abort(); } catch { /* best effort */ }
      controller = null;
      notifyIdle();
    },
  };
}

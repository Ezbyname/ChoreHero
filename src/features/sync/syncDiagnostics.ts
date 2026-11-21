// QA sync diagnostics — a passive record of what the household sync did, so
// a physical-device QA run can show WHY a screen is stale without adb.
// Pure (no React / react-native) — Node-test safe. Recording never feeds
// back into scheduling; it only observes.
//
// Holds no identifiers at all: no tokens, URLs, household / user / task
// ids, storage paths — only statuses, counters and timestamps.

import type { RefreshReason, RefreshSchedulerEvent } from '@/features/sync/refreshScheduler';

export type RefreshResultLabel = 'success' | 'failed' | 'timeout' | 'skipped' | 'dropped';

export type SyncDiagnosticsSnapshot = {
  channelStatus:         string | null;
  channelStatusAt:       number | null;
  channelProblems:       number;
  realtimeEvents:        number;
  lastRealtimeEventAt:   number | null;
  refreshRunning:        boolean;
  refreshStartedAt:      number | null;
  refreshReasons:        RefreshReason[];
  lastRefreshDurationMs: number | null;
  lastRefreshResult:     RefreshResultLabel | null;
  lastRefreshEndedAt:    number | null;
  // Requests that arrived while a refresh was running (they collapse into
  // one follow-up run).
  queuedRequests:        number;
  refreshCount:          number;
  timeoutCount:          number;
  lastResumeAt:          number | null;
};

export const EMPTY_SYNC_DIAGNOSTICS: SyncDiagnosticsSnapshot = {
  channelStatus:         null,
  channelStatusAt:       null,
  channelProblems:       0,
  realtimeEvents:        0,
  lastRealtimeEventAt:   null,
  refreshRunning:        false,
  refreshStartedAt:      null,
  refreshReasons:        [],
  lastRefreshDurationMs: null,
  lastRefreshResult:     null,
  lastRefreshEndedAt:    null,
  queuedRequests:        0,
  refreshCount:          0,
  timeoutCount:          0,
  lastResumeAt:          null,
};

const CHANNEL_PROBLEM_STATUSES = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

// The run's own result string (householdRefresh's HouseholdRefreshResult, or
// the scheduler's 'error' for a throwing run) -> the label QA reads.
export function refreshResultLabel(result: string): RefreshResultLabel {
  switch (result) {
    case 'applied': return 'success';
    case 'skipped': return 'skipped';
    case 'dropped': return 'dropped';
    default:        return 'failed';
  }
}

export type SyncDiagnostics = {
  recordScheduler:     (event: RefreshSchedulerEvent) => void;
  recordChannelStatus: (status: string, at: number) => void;
  recordRealtimeEvent: (at: number) => void;
  recordResume:        (at: number) => void;
  snapshot:            () => SyncDiagnosticsSnapshot;
  subscribe:           (listener: () => void) => () => void;
  reset:               () => void;
};

export function createSyncDiagnostics(): SyncDiagnostics {
  let state: SyncDiagnosticsSnapshot = EMPTY_SYNC_DIAGNOSTICS;
  const listeners = new Set<() => void>();

  function update(patch: Partial<SyncDiagnosticsSnapshot>) {
    state = { ...state, ...patch };
    for (const l of listeners) {
      try { l(); } catch { /* a listener must never break sync */ }
    }
  }

  return {
    recordScheduler(event) {
      switch (event.type) {
        case 'request':
          if (event.outcome === 'queued') update({ queuedRequests: state.queuedRequests + 1 });
          return;
        case 'start':
          update({
            refreshRunning:   true,
            refreshStartedAt: event.at,
            refreshReasons:   event.reasons,
            queuedRequests:   0,
            refreshCount:     state.refreshCount + 1,
          });
          return;
        case 'end':
          update({
            refreshRunning:        false,
            lastRefreshDurationMs: event.durationMs,
            lastRefreshResult:     refreshResultLabel(event.result),
            lastRefreshEndedAt:    event.at,
          });
          return;
        case 'timeout':
          update({
            refreshRunning:        false,
            lastRefreshDurationMs: event.durationMs,
            lastRefreshResult:     'timeout',
            lastRefreshEndedAt:    event.at,
            timeoutCount:          state.timeoutCount + 1,
          });
          return;
      }
    },
    recordChannelStatus(status, at) {
      update({
        channelStatus:   status,
        channelStatusAt: at,
        channelProblems: state.channelProblems + (CHANNEL_PROBLEM_STATUSES.has(status) ? 1 : 0),
      });
    },
    recordRealtimeEvent(at) {
      update({ realtimeEvents: state.realtimeEvents + 1, lastRealtimeEventAt: at });
    },
    recordResume(at) {
      update({ lastResumeAt: at });
    },
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    reset() {
      update(EMPTY_SYNC_DIAGNOSTICS);
    },
  };
}

// "4 s ago" / "3 min ago" / "—". Pure, for the QA panel.
export function formatAge(at: number | null, now: number): string {
  if (at === null) return '—';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}

// Diagnostics are drawn ONLY in a QA-variant build (same gate as the QA
// badge in ScreenHeader). Production and unconfigured builds never show it.
export function isSyncDiagnosticsVisible(appVariant: string | null | undefined): boolean {
  return appVariant === 'qa';
}

export type SyncDiagnosticsRow = { label: string; value: string };

// Rows for the QA panel. Technical, English-only, QA-only — statuses,
// counts and ages, never identifiers.
export function buildSyncDiagnosticsRows(d: SyncDiagnosticsSnapshot, now: number): SyncDiagnosticsRow[] {
  const ms = (v: number | null) => (v === null ? '—' : `${(v / 1000).toFixed(1)} s`);
  return [
    { label: 'Live channel',        value: d.channelStatus ? `${d.channelStatus} (${formatAge(d.channelStatusAt, now)})` : 'not connected' },
    { label: 'Channel problems',    value: String(d.channelProblems) },
    { label: 'Live events',         value: `${d.realtimeEvents} (last ${formatAge(d.lastRealtimeEventAt, now)})` },
    { label: 'Refresh running',     value: d.refreshRunning ? `yes, for ${ms(d.refreshStartedAt === null ? null : now - d.refreshStartedAt)}` : 'no' },
    { label: 'Last refresh start',  value: `${formatAge(d.refreshStartedAt, now)}${d.refreshReasons.length ? ` · ${d.refreshReasons.join(', ')}` : ''}` },
    { label: 'Last refresh result', value: d.lastRefreshResult ? `${d.lastRefreshResult} · ${ms(d.lastRefreshDurationMs)} · ${formatAge(d.lastRefreshEndedAt, now)}` : '—' },
    { label: 'Waiting requests',    value: String(d.queuedRequests) },
    { label: 'Refreshes / timeouts', value: `${d.refreshCount} / ${d.timeoutCount}` },
    { label: 'Last app resume',     value: formatAge(d.lastResumeAt, now) },
  ];
}

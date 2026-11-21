// Background refresh of the active household's domain data — the ONE path
// every screen, Realtime event, focus/resume trigger and post-mutation
// follow-up uses to bring the UI back in line with the server.
//
// Unlike requestAppDataHydrationRetry() (a full re-hydration, which flips
// the app into its loading state and remounts the whole navigator — that is
// what used to replace the completion sheet with "Getting your ChoreHero
// ready…" and drop the child back on Today), this never touches hydration
// state: it fetches the household's lists and replaces them in one store
// update. The navigator, the current tab and any open sheet stay put.

import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import {
  getContributionClaimsForHousehold,
  getPointsBalancesForHousehold,
  getRewardRedemptionsForHousehold,
  getRewardsForHousehold,
  getTaskSubmissionSummariesForHousehold,
  getTasksForHousehold,
} from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';
import {
  createRefreshScheduler,
  type RefreshReason,
  type RefreshRequestOutcome,
  type RefreshRunContext,
} from '@/features/sync/refreshScheduler';
import { createSyncDiagnostics } from '@/features/sync/syncDiagnostics';

export type HouseholdRefreshDeps = {
  getTasks:        typeof getTasksForHousehold;
  getRewards:      typeof getRewardsForHousehold;
  getPoints:       typeof getPointsBalancesForHousehold;
  getClaims:       typeof getContributionClaimsForHousehold;
  getRedemptions:  typeof getRewardRedemptionsForHousehold;
  getSubmissions:  typeof getTaskSubmissionSummariesForHousehold;
  isConfigured:    boolean;
};

const defaultDeps: HouseholdRefreshDeps = {
  getTasks:       getTasksForHousehold,
  getRewards:     getRewardsForHousehold,
  getPoints:      getPointsBalancesForHousehold,
  getClaims:      getContributionClaimsForHousehold,
  getRedemptions: getRewardRedemptionsForHousehold,
  getSubmissions: getTaskSubmissionSummariesForHousehold,
  isConfigured:   isSupabaseConfigured,
};

// skipped — nothing to refresh (mock mode, signed out, not hydrated yet)
// failed  — a required list could not be fetched; current data kept as is
// dropped — fetched, but the household changed / signed out meanwhile
export type HouseholdRefreshResult = 'applied' | 'skipped' | 'failed' | 'dropped';

export async function refreshHouseholdData(
  deps: HouseholdRefreshDeps = defaultDeps,
  // From the scheduler: signal = best-effort cancel of a hung run;
  // isCurrent() = false once the run was abandoned (timed out). A run that
  // is no longer current must never write: newer data may already be there.
  ctx: Partial<RefreshRunContext> = {},
): Promise<HouseholdRefreshResult> {
  const { activeHouseholdId, isAppDataReady } = useAppStore.getState();
  if (!deps.isConfigured || !activeHouseholdId || !isAppDataReady) return 'skipped';

  const opts = { signal: ctx.signal ?? null };
  const [tasks, rewards, points, claims, redemptions, submissions] = await Promise.all([
    deps.getTasks(activeHouseholdId, opts),
    deps.getRewards(activeHouseholdId, opts),
    deps.getPoints(activeHouseholdId, opts),
    deps.getClaims(activeHouseholdId, opts),
    deps.getRedemptions(activeHouseholdId, opts),
    // Not abortable (protected repository signature); the isCurrent() gate
    // below covers it the same way.
    deps.getSubmissions(activeHouseholdId),
  ]);

  if (ctx.isCurrent && !ctx.isCurrent()) return 'dropped';
  if (tasks.error || rewards.error || points.error || claims.error || redemptions.error) return 'failed';

  const applied = useAppStore.getState().applyHouseholdRefresh({
    householdId:        activeHouseholdId,
    tasks:              tasks.data,
    rewards:            rewards.data,
    pointsBalances:     points.data,
    contributionClaims: claims.data,
    rewardRedemptions:  redemptions.data,
    taskSubmissions:    submissions.error ? null : submissions.data,
  });
  return applied ? 'applied' : 'dropped';
}

// Passive record for the QA-build sync diagnostics panel (Settings).
export const syncDiagnostics = createSyncDiagnostics();

const scheduler = createRefreshScheduler(
  (ctx) => refreshHouseholdData(defaultDeps, ctx),
  {
    setTimeout:   (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    now:          () => Date.now(),
  },
  { onEvent: syncDiagnostics.recordScheduler },
);

// Fire-and-forget. Safe to call from anywhere, any number of times.
export function requestHouseholdRefresh(reason: RefreshReason): RefreshRequestOutcome {
  return scheduler.request(reason);
}

// Pull-to-refresh: the same scheduler (coalescing, timeout, stale-result
// protection), never a separate fetch. Resolves when the scheduler is idle
// again — at the latest after one run timeout.
export function refreshHouseholdNow(): Promise<void> {
  scheduler.request('manual');
  return scheduler.whenIdle();
}

export function markHouseholdDataFresh(): void {
  scheduler.markFresh();
}

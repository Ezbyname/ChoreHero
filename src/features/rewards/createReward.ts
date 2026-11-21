import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { getRewardsForHousehold, insertReward } from '@/lib/repositories';
import { requestHouseholdRefresh } from '@/features/sync/householdRefresh';
import type { RefreshReason } from '@/features/sync/refreshScheduler';
import { mapRewardRow, useAppStore } from '@/store/useAppStore';

export type CreateRewardResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'invalid_input' | 'failed' };

interface CreateRewardInput {
  householdId:         string;
  title:                string;
  description?:         string;
  // Mirrors rewards.points_required's own DB constraint
  // (chk_rewards_points_positive: integer > 0) — validated here so a bad
  // value surfaces as invalid_input rather than a raw constraint error.
  // Not a new product rule: the schema already requires this.
  requiredPoints:       number;
  createdByProfileId:   string;
  role:                 string | null;
}

// Test seam only; production callers pass no deps.
export interface CreateRewardDeps {
  insertFn?:       typeof insertReward;
  getRewardsFn?:   typeof getRewardsForHousehold;
  requestRefresh?: (reason: RefreshReason) => unknown;
}

export async function createReward(
  input: CreateRewardInput,
  deps:  CreateRewardDeps = {},
): Promise<CreateRewardResult> {
  if (!hasHouseholdPermission(input.role, 'rewards.create')) {
    return { ok: false, reason: 'not_authorized' };
  }

  const title = input.title.trim();
  if (!title) return { ok: false, reason: 'invalid_input' };

  if (!Number.isInteger(input.requiredPoints) || input.requiredPoints <= 0) {
    return { ok: false, reason: 'invalid_input' };
  }

  // Empty/whitespace-only normalizes to undefined (-> NULL on persist),
  // matching createTask's own description handling.
  const description = input.description?.trim() || undefined;

  if (!isSupabaseConfigured) {
    const { rewards, setRewards } = useAppStore.getState();
    setRewards([
      {
        id:             `reward-${Date.now()}`,
        householdId:    input.householdId,
        title,
        description,
        requiredPoints: input.requiredPoints,
        isActive:       true,
      },
      ...rewards,
    ]);
    return { ok: true };
  }

  const insertFn       = deps.insertFn       ?? insertReward;
  const getRewardsFn   = deps.getRewardsFn   ?? getRewardsForHousehold;
  const requestRefresh = deps.requestRefresh ?? requestHouseholdRefresh;

  const inserted = await insertFn({
    householdId:        input.householdId,
    title,
    description,
    requiredPoints:      input.requiredPoints,
    createdByProfileId: input.createdByProfileId,
  });
  if (inserted.error || !inserted.data) return { ok: false, reason: 'failed' };

  // The reward EXISTS from here on: a failed follow-up read must never be
  // reported as a failed creation (the adult would tap Create again and get
  // a duplicate). Show the inserted row now; a background refresh follows.
  const refreshed = await getRewardsFn(input.householdId);
  const store = useAppStore.getState();
  if (!refreshed.error) {
    store.setRewardRows(refreshed.data);
  } else {
    const row = inserted.data;
    store.setRewards([mapRewardRow(row), ...store.rewards.filter((r) => r.id !== row.id)]);
    requestRefresh('mutation');
  }
  return { ok: true };
}

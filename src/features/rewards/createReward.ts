import { hasHouseholdPermission } from '@/domain/permissions';
import { isSupabaseConfigured } from '@/lib/supabaseConfig';
import { getRewardsForHousehold, insertReward } from '@/lib/repositories';
import { useAppStore } from '@/store/useAppStore';

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

export async function createReward(input: CreateRewardInput): Promise<CreateRewardResult> {
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

  const inserted = await insertReward({
    householdId:        input.householdId,
    title,
    description,
    requiredPoints:      input.requiredPoints,
    createdByProfileId: input.createdByProfileId,
  });
  if (inserted.error) return { ok: false, reason: 'failed' };

  const refreshed = await getRewardsForHousehold(input.householdId);
  if (refreshed.error) return { ok: false, reason: 'failed' };

  useAppStore.getState().setRewardRows(refreshed.data);
  return { ok: true };
}

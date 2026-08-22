import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { useAppStore } from '@/store/useAppStore';
import type { HydrationContext } from '@/types/hydration';

const HOUSEHOLD_ID = 'house-1';
const USER_ID      = 'user-1';
const NOW          = new Date().toISOString();

function baseContext(overrides: Partial<HydrationContext> = {}): HydrationContext {
  return {
    profile: {
      id:                   USER_ID,
      display_name:         'Test User',
      avatar_url:           null,
      avatar_emoji:         null,
      default_household_id: HOUSEHOLD_ID,
      created_at:           NOW,
      updated_at:           NOW,
    },
    household: {
      id:                    HOUSEHOLD_ID,
      name:                  'Test Household',
      created_by_profile_id: USER_ID,
      created_at:            NOW,
      updated_at:            NOW,
    },
    householdMembers: [
      {
        id:                    'member-1',
        household_id:          HOUSEHOLD_ID,
        profile_id:            USER_ID,
        role:                  'child',
        display_name_override: null,
        joined_at:              NOW,
        created_at:             NOW,
        updated_at:             NOW,
      },
    ],
    memberProfiles: [
      {
        id:                   USER_ID,
        display_name:         'Test User',
        avatar_url:           null,
        avatar_emoji:         null,
        default_household_id: HOUSEHOLD_ID,
        created_at:           NOW,
        updated_at:           NOW,
      },
    ],
    tasks:              [],
    rewards:            [],
    pointsBalances:     [],
    contributionClaims: [],
    rewardRedemptions:  [],
    activeHouseholdId:  HOUSEHOLD_ID,
    hasNoHousehold:     false,
    ...overrides,
  };
}

function commit(context: HydrationContext): void {
  const runId    = 'run-1';
  const sequence = 1;
  useAppStore.getState().startHydrationRun({ runId, sequence });
  useAppStore.getState().commitHydrationSnapshot({ context, runId, sequence });
}

afterEach(() => {
  useAppStore.getState().resetAppState();
});

test('commitHydrationSnapshot maps reward_redemptions rows into the store with correct snake_case to camelCase mapping', () => {
  commit(
    baseContext({
      rewardRedemptions: [
        {
          id:                        'redemption-1',
          household_id:              HOUSEHOLD_ID,
          reward_id:                 'reward-1',
          requested_by_profile_id:   USER_ID,
          client_request_id:        'key-1',
          points_required_snapshot: 50,
          status:                   'pending',
          reviewed_by_profile_id:   null,
          reviewed_at:              null,
          requested_at:             NOW,
          created_at:               NOW,
          updated_at:               NOW,
        },
      ],
    }),
  );

  const redemptions = useAppStore.getState().rewardRedemptions;
  assert.equal(redemptions.length, 1);
  assert.deepEqual(redemptions[0], {
    id:                     'redemption-1',
    householdId:            HOUSEHOLD_ID,
    rewardId:               'reward-1',
    requestedByProfileId:   USER_ID,
    clientRequestId:        'key-1',
    pointsRequiredSnapshot: 50,
    status:                 'pending',
    reviewedByProfileId:    undefined,
    reviewedAt:             undefined,
    requestedAt:            NOW,
    createdAt:              NOW,
    updatedAt:              NOW,
  });
});

test('an empty reward_redemptions hydration result produces an empty store slice, not stale data', () => {
  useAppStore.getState().setRewardRedemptions([
    {
      id: 'stale', householdId: HOUSEHOLD_ID, rewardId: 'r', requestedByProfileId: USER_ID,
      clientRequestId: 'k', pointsRequiredSnapshot: 1, status: 'pending',
      requestedAt: NOW, createdAt: NOW, updatedAt: NOW,
    },
  ]);

  commit(baseContext({ rewardRedemptions: [] }));

  assert.deepEqual(useAppStore.getState().rewardRedemptions, []);
});

test('clearAppData removes reward redemption state on sign-out', () => {
  useAppStore.getState().setRewardRedemptions([
    {
      id: 'r1', householdId: HOUSEHOLD_ID, rewardId: 'r', requestedByProfileId: USER_ID,
      clientRequestId: 'k', pointsRequiredSnapshot: 1, status: 'pending',
      requestedAt: NOW, createdAt: NOW, updatedAt: NOW,
    },
  ]);

  useAppStore.getState().clearAppData();

  assert.deepEqual(useAppStore.getState().rewardRedemptions, []);
});

// Repository-consistent failure handling: a malformed/inconsistent context
// (a redemption belonging to a different household than the active one)
// must be rejected by the existing hydration guard rather than silently
// committed — mirrors the same invariant already enforced for
// contributionClaims/tasks/rewards.
test('a reward_redemptions row from a different household fails the existing hydration invariant guard', () => {
  commit(
    baseContext({
      rewardRedemptions: [
        {
          id:                        'redemption-1',
          household_id:              'some-other-household',
          reward_id:                 'reward-1',
          requested_by_profile_id:   USER_ID,
          client_request_id:        'key-1',
          points_required_snapshot: 50,
          status:                   'pending',
          reviewed_by_profile_id:   null,
          reviewed_at:              null,
          requested_at:             NOW,
          created_at:               NOW,
          updated_at:               NOW,
        },
      ],
    }),
  );

  // The guard throws inside commitHydrationSnapshot's try/catch, which
  // surfaces as a hydration error state rather than a partial/incorrect
  // commit — existing repository-consistent behavior, not new handling.
  assert.equal(useAppStore.getState().appHydrationState, 'error');
  assert.equal(useAppStore.getState().appDataErrorCode, 'load_failed');
  assert.equal(useAppStore.getState().rewardRedemptions.length, 0);
});

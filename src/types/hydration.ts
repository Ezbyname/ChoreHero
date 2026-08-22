import type {
  ProfileRow,
  HouseholdRow,
  HouseholdMemberRow,
  TaskRow,
  RewardRow,
  PointsBalanceRow,
  ContributionClaimRow,
  RewardRedemptionRow,
} from '@/types/supabase';

// Observable states for the app data hydration pipeline.
//
// idle     — no hydration has started (initial, or after clearAppData)
// loading  — a hydration run is in progress
// hydrated — all phases completed; profile + household + domain data loaded
// partial  — profile loaded, no household membership exists (valid new-user state)
// error    — a hydration phase failed; see appDataError for the message
export type AppHydrationState = 'idle' | 'loading' | 'hydrated' | 'partial' | 'error';

// Snapshot produced by a completed hydration run.
// Used as the sole input to commitHydrationSnapshot.
// All fields use raw DB rows; mapping to app-layer types happens inside the store action.
export interface HydrationContext {
  profile:           ProfileRow;
  household:         HouseholdRow | null;
  householdMembers:  HouseholdMemberRow[];
  // Profiles for every householdMembers row (name, avatar_url, avatar_emoji).
  // Fetched separately from householdMembers since household_members has no
  // embedded profile join in the repository layer yet.
  memberProfiles:     ProfileRow[];
  tasks:              TaskRow[];
  rewards:            RewardRow[];
  pointsBalances:     PointsBalanceRow[];
  contributionClaims: ContributionClaimRow[];
  // Decision 11 (self-or-adult+): a single household-scoped repository call
  // (getRewardRedemptionsForHousehold), mirroring contributionClaims exactly
  // — RLS, not this fetch, determines whether a child sees only their own
  // rows or an adult+ sees the whole household's.
  rewardRedemptions:  RewardRedemptionRow[];
  activeHouseholdId:  string | null;
  hasNoHousehold:     boolean;
}

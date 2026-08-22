import type { AppStore } from '@/store/useAppStore';
import { hasHouseholdPermission } from '@/domain/permissions';

// ── App data selectors ────────────────────────────────────────────────────────

export const selectCurrentUser      = (s: AppStore) => s.user;
export const selectCurrentHousehold = (s: AppStore) => s.household;
export const selectTasks            = (s: AppStore) => s.tasks;
export const selectRewards          = (s: AppStore) => s.rewards;
export const selectPointsBalances   = (s: AppStore) => s.pointsBalances;
export const selectIsMockHydrated   = (s: AppStore) => s.isMockHydrated;

export const selectCurrentUserName = (s: AppStore): string | null =>
  s.user?.name ?? null;

// The current viewer's own points balance. Never assume position 0 in
// pointsBalances belongs to the viewer — the array holds one row per
// household member with a balance, in no viewer-relative order.
export const selectMyPointsBalance = (s: AppStore) => {
  const userId = s.user?.id ?? null;
  if (!userId) return null;
  return s.pointsBalances.find((pb) => pb.userId === userId) ?? null;
};

// ── Auth selectors ────────────────────────────────────────────────────────────

export const selectAuthSession    = (s: AppStore) => s.authSession;
export const selectAuthUser       = (s: AppStore) => s.authUser;
export const selectIsAuthResolved = (s: AppStore) => s.isAuthResolved;
export const selectIsAuthLoading  = (s: AppStore) => s.isAuthLoading;
export const selectAuthError      = (s: AppStore) => s.authError;

export const selectAuthUserEmail = (s: AppStore): string | null =>
  s.authUser?.email ?? null;

// True once Supabase auth identity is confirmed (signed in or signed out).
export const selectIsAuthenticated = (s: AppStore): boolean =>
  Boolean(s.authUser);

// ── Hydration selectors ───────────────────────────────────────────────────────

export const selectAppHydrationState     = (s: AppStore) => s.appHydrationState;
export const selectIsAppDataReady        = (s: AppStore) => s.isAppDataReady;
export const selectIsAppDataLoading      = (s: AppStore) => s.isAppDataLoading;
export const selectAppDataError          = (s: AppStore) => s.appDataError;
export const selectAppDataErrorCode      = (s: AppStore) => s.appDataErrorCode;
export const selectActiveHouseholdId     = (s: AppStore) => s.activeHouseholdId;
export const selectHasNoHousehold        = (s: AppStore) => s.hasNoHousehold;
export const selectAppDataVersion        = (s: AppStore) => s.appDataVersion;
export const selectHydratedForAuthUserId = (s: AppStore) => s.hydratedForAuthUserId;
export const selectHydrationRunId        = (s: AppStore) => s.hydrationRunId;
export const selectHydrationSequence     = (s: AppStore) => s.hydrationSequence;

// True if the store holds hydrated data for the currently authenticated user.
export const selectIsHydratedForCurrentUser = (s: AppStore): boolean =>
  Boolean(s.authUser) &&
  s.hydratedForAuthUserId === s.authUser?.id &&
  (s.appHydrationState === 'hydrated' || s.appHydrationState === 'partial');

// True when the auth user has no ChoreHero profile yet.
// Drives ProfileSetupScreen visibility via AuthenticatedAppGate.
// This is a recovery UX state, not a hydration state variant.
export const selectNeedsProfileSetup = (s: AppStore): boolean =>
  s.appHydrationState === 'error' && s.appDataErrorCode === 'missing_profile';

// ── Active household selectors (T1.5.5) ──────────────────────────────────────
//
// Hydration owns active household selection (AppDataBootstrap → commitHydrationSnapshot).
// These selectors expose the already-selected result to UI.
// Screens must consume these; they must not call .find(...) or access households[0].

// Alias of selectCurrentHousehold — same field, semantic name for T1.5.5+ screens.
// Using an alias prevents drift: both always return s.household.
export const selectActiveHousehold = selectCurrentHousehold;

// Derived from selectActiveHousehold — never resolved independently by screens.
export const selectActiveHouseholdName = (s: AppStore): string | null =>
  selectActiveHousehold(s)?.name ?? null;

// True only in the fully hydrated state with a non-null household.
// 'partial' state = profile exists but no household; not considered "active".
export const selectHasActiveHousehold = (s: AppStore): boolean =>
  s.appHydrationState === 'hydrated' && selectActiveHousehold(s) !== null;

// ── Role & permission selectors (T1.6.1) ─────────────────────────────────────
//
// Screens and components must use these selectors instead of comparing roles directly.
// Role reasoning lives in src/domain/permissions.ts — not in UI code.
//
// Ownership chain:
//   Hydration → s.household.members (HouseholdMember[])
//   selectCurrentMemberRole → domain helper
//   selectCan* → UI consumption
//
// s.household.members is the correct access path.
// There is no top-level s.householdMembers field in the store.

// Returns the current user's role in the active household, or null if unavailable.
// null covers: not hydrated, no household, user not a member, user not found.
export const selectCurrentMemberRole = (s: AppStore): string | null => {
  const userId = s.user?.id ?? null;
  if (!userId || !s.household) return null;
  const member = s.household.members.find((m) => m.userId === userId);
  return member?.role ?? null;
};

// ── Permission selectors ──────────────────────────────────────────────────────
//
// Each selector delegates to hasHouseholdPermission from the domain layer.
// Deny-by-default: returns false when role is null, undefined, or unknown.
// Screens must use these — no direct role comparisons in UI code.

// Household management
export const selectCanManageHousehold = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'household.manage');

export const selectCanInviteMembers = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'household.invite');

export const selectCanManageMembers = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'members.manage');

// Tasks
export const selectCanCreateTasks = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'tasks.create');

export const selectCanAssignTasks = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'tasks.assign');

export const selectCanApproveTaskCompletion = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'tasks.approve_completion');

export const selectCanRejectTaskCompletion = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'tasks.reject_completion');

// Rewards
export const selectCanCreateRewards = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'rewards.create');

export const selectCanApproveRequests = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'requests.approve');

// Reward redemption. rewards.request_redemption structurally lives in
// CHILD_PERMISSIONS and is therefore inherited upward through the role
// hierarchy (an adult's permission set contains the string too) — that
// inheritance is NOT authoritative proof an adult may request (Decision 4:
// requester = beneficiary = child, always). The exact-role check below
// mirrors the same check the domain layer (requestRewardRedemption.ts) and
// the database RPC already enforce; it is a UI-facing convenience that
// agrees with the authoritative boundary, not a second boundary of its own.
export const selectCanRequestRedemption = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'rewards.request_redemption') &&
  selectCurrentMemberRole(s) === 'child';

// approve/reject are adult+-only permission strings (not shared with
// child), so no additional exact-role narrowing is needed here — mirrors
// approveRewardRedemption.ts/rejectRewardRedemption.ts, which likewise
// apply no check beyond the permission itself.
export const selectCanApproveRedemption = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'rewards.approve_redemption');

export const selectCanRejectRedemption = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'rewards.reject_redemption');

// Contributions (vocabulary for T1.7.x — no contribution runtime flow in T1.6.1)
export const selectCanCreateContribution = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'contributions.create_completed');

export const selectCanClaimContribution = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'contributions.claim_completed');

export const selectCanApproveContributionClaim = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'contributions.approve_claim');

export const selectCanRejectContributionClaim = (s: AppStore): boolean =>
  hasHouseholdPermission(selectCurrentMemberRole(s), 'contributions.reject_claim');

// ── Contribution claim projection selectors (T1.7.3) ─────────────────────────
//
// Contribution ≠ Task: contribution_claims is a separate state source from
// tasks. Screens must derive claim views from these selectors — never infer
// claim/review state from Task.status.

export const selectContributionClaims = (s: AppStore) => s.contributionClaims;

// ── DO NOT call these three directly via useAppStore(...) from a component ──
//
// Each allocates a new array on every call. Passed straight to useAppStore,
// that new-reference-every-render defeats useSyncExternalStore's snapshot
// comparison — React sees "the store changed" on every check, re-renders,
// gets another new array, and never converges, throwing React error #185
// ("Maximum update depth exceeded") with no effect and no direct setState
// anywhere involved. Confirmed: this is exactly what took down TodayScreen
// in production on every real hydration.
//
// Safe uses: composing into another selector that reduces to a primitive
// (as selectPendingContributionClaimCount does below), or calling from a
// component via selectContributionClaims (stable) + a local useMemo filter
// (see TodayScreen.tsx's pendingClaims). Never useAppStore(thisSelector)
// directly.

// Household-wide claims still awaiting review — feeds the parent review section.
export const selectPendingContributionClaims = (s: AppStore) =>
  s.contributionClaims.filter((c) => c.status === 'pending');

// All claims (any status) submitted by the current user.
export const selectContributionClaimsForCurrentUser = (s: AppStore) => {
  const userId = s.user?.id ?? null;
  if (!userId) return [];
  return s.contributionClaims.filter((c) => c.claimedByProfileId === userId);
};

// Current user's own claims still awaiting review — "waiting for approval" state.
export const selectMyPendingContributionClaims = (s: AppStore) =>
  selectContributionClaimsForCurrentUser(s).filter((c) => c.status === 'pending');

export const selectPendingContributionClaimCount = (s: AppStore): number =>
  selectPendingContributionClaims(s).length;

// True when the current user can review claims and at least one is waiting.
// Drives visibility of the review section — permission-gated, not role-compared.
export const selectHasPendingContributionClaimsToReview = (s: AppStore): boolean =>
  selectCanApproveContributionClaim(s) && selectPendingContributionClaimCount(s) > 0;

// ── Reward redemption projection selectors ────────────────────────────────────
//
// s.rewardRedemptions already reflects Decision 11's RLS visibility scoping
// (self-or-adult+) by the time it reaches the store — a child's array only
// ever contains their own rows; an adult+'s contains the whole household's.
// These selectors project that array; they do not re-derive or narrow
// visibility themselves.
//
// Same new-array-per-call caveat as the contribution claim selectors above:
// never call these directly via useAppStore(...) from a component. Compose
// into another selector that reduces to a primitive (as
// selectPendingRedemptionCount does below), or call via selectRewardRedemptions
// (stable) + a local useMemo filter.

export const selectRewardRedemptions = (s: AppStore) => s.rewardRedemptions;

// Household-wide redemptions still awaiting review — feeds the parent
// review section. Mirrors selectPendingContributionClaims exactly.
export const selectPendingRewardRedemptions = (s: AppStore) =>
  s.rewardRedemptions.filter((r) => r.status === 'pending');

// All redemptions (any status) requested by the current user. A different
// child's redemption is never included, even for an adult+ viewer whose
// array contains the whole household's rows.
export const selectRewardRedemptionsForCurrentUser = (s: AppStore) => {
  const userId = s.user?.id ?? null;
  if (!userId) return [];
  return s.rewardRedemptions.filter((r) => r.requestedByProfileId === userId);
};

// Current user's own redemptions still awaiting review — "waiting for
// approval" state, for the requesting child's own UI.
export const selectMyPendingRewardRedemptions = (s: AppStore) =>
  selectRewardRedemptionsForCurrentUser(s).filter((r) => r.status === 'pending');

export const selectPendingRedemptionCount = (s: AppStore): number =>
  selectPendingRewardRedemptions(s).length;

// True when the current user can review redemptions and at least one is
// waiting. Drives visibility of the review section — permission-gated, not
// role-compared. Mirrors selectHasPendingContributionClaimsToReview exactly.
export const selectHasPendingRedemptionsToReview = (s: AppStore): boolean =>
  selectCanApproveRedemption(s) && selectPendingRedemptionCount(s) > 0;

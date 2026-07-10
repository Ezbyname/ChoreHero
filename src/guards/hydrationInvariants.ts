// ── Hydration contract guards ─────────────────────────────────────────────────
//
// Hydration guards validate snapshot consistency only.
// They must not make product decisions, repair data, perform fallbacks,
// or duplicate business rules.
//
// Guards are pure: no React, no Zustand, no Supabase client, no network,
// no repository calls, no mutations of inputs.
//
// The store commit (commitHydrationSnapshot) is the single enforcement point
// that calls these guards before any app data is written.

import type { HydrationContext } from '@/types/hydration';

// ── Commit identity guard ─────────────────────────────────────────────────────

/**
 * Returns true only if the incoming commit belongs to the currently active
 * hydration run. Both runId and sequence must match exactly.
 *
 * false → no app data mutation, no appDataVersion increment.
 *
 * Protects against:
 *   - logout during hydration
 *   - auth user switch during hydration
 *   - run A completing after run B has already started
 *   - React StrictMode duplicate effects
 *   - Supabase session-restore duplicate auth events
 */
export function isHydrationCommitAllowed(input: {
  currentRunId:     string | null;
  currentSequence:  number;
  incomingRunId:    string;
  incomingSequence: number;
}): boolean {
  return (
    input.currentRunId    === input.incomingRunId &&
    input.currentSequence === input.incomingSequence
  );
}

// ── Full hydration invariant ──────────────────────────────────────────────────

/**
 * Asserts that a fully-hydrated HydrationContext is internally consistent.
 * Call this before committing a snapshot where hasNoHousehold === false.
 *
 * Throws if any invariant is violated.
 * Never silently repairs or transforms data.
 */
export function assertValidHydrationContext(context: HydrationContext): void {
  if (context.hasNoHousehold) {
    throw new Error(
      'assertValidHydrationContext: received partial context (hasNoHousehold=true); ' +
      'use assertPartialHydrationContext instead.',
    );
  }

  // Profile must exist (profile.id is the auth UID).
  if (!context.profile) {
    throw new Error('HydrationContext: profile must exist.');
  }

  // Full hydration requires a household.
  if (!context.household) {
    throw new Error(
      'HydrationContext: household must not be null when hasNoHousehold is false.',
    );
  }

  // activeHouseholdId must be set and match household.id.
  if (context.activeHouseholdId === null) {
    throw new Error(
      'HydrationContext: activeHouseholdId must not be null when hasNoHousehold is false.',
    );
  }
  if (context.activeHouseholdId !== context.household.id) {
    throw new Error(
      `HydrationContext: activeHouseholdId "${context.activeHouseholdId}" does not match ` +
      `household.id "${context.household.id}".`,
    );
  }

  // Domain arrays must be arrays (not null/undefined from a broken DB response).
  if (!Array.isArray(context.tasks)) {
    throw new Error('HydrationContext: tasks must be an array.');
  }
  if (!Array.isArray(context.rewards)) {
    throw new Error('HydrationContext: rewards must be an array.');
  }
  if (!Array.isArray(context.pointsBalances)) {
    throw new Error('HydrationContext: pointsBalances must be an array.');
  }
  if (!Array.isArray(context.contributionClaims)) {
    throw new Error('HydrationContext: contributionClaims must be an array.');
  }
  if (!Array.isArray(context.householdMembers)) {
    throw new Error('HydrationContext: householdMembers must be an array.');
  }
  if (!Array.isArray(context.memberProfiles)) {
    throw new Error('HydrationContext: memberProfiles must be an array.');
  }

  // Cross-entity household consistency:
  // Every domain row must belong to the active household.
  // This prevents a mixed snapshot where a row from a different household
  // appears alongside the active household's data.
  const hid = context.activeHouseholdId;

  for (const task of context.tasks) {
    if (task.household_id !== hid) {
      throw new Error(
        `HydrationContext: task "${task.id}" has household_id "${task.household_id}", ` +
        `expected "${hid}".`,
      );
    }
  }

  for (const reward of context.rewards) {
    if (reward.household_id !== hid) {
      throw new Error(
        `HydrationContext: reward "${reward.id}" has household_id "${reward.household_id}", ` +
        `expected "${hid}".`,
      );
    }
  }

  for (const pb of context.pointsBalances) {
    if (pb.household_id !== hid) {
      throw new Error(
        `HydrationContext: pointsBalance for profile "${pb.profile_id}" has ` +
        `household_id "${pb.household_id}", expected "${hid}".`,
      );
    }
  }

  for (const claim of context.contributionClaims) {
    if (claim.household_id !== hid) {
      throw new Error(
        `HydrationContext: contributionClaim "${claim.id}" has household_id "${claim.household_id}", ` +
        `expected "${hid}".`,
      );
    }
  }

  // householdMembers: household_id is validated where present.
  for (const member of context.householdMembers) {
    if (member.household_id !== hid) {
      throw new Error(
        `HydrationContext: householdMember "${member.id}" has household_id "${member.household_id}", ` +
        `expected "${hid}".`,
      );
    }
  }

  // memberProfiles has no household_id of its own — instead, every profile
  // must correspond to one of this household's members. Guards against a
  // stray profile from an unrelated fetch leaking into the snapshot.
  const memberProfileIds = new Set(context.householdMembers.map((m) => m.profile_id));
  for (const profile of context.memberProfiles) {
    if (!memberProfileIds.has(profile.id)) {
      throw new Error(
        `HydrationContext: memberProfile "${profile.id}" does not correspond to any ` +
        `householdMembers row for household "${hid}".`,
      );
    }
  }
}

// ── Partial hydration invariant ───────────────────────────────────────────────

/**
 * Asserts that a partial HydrationContext is valid.
 * partial is terminal and only valid for the "profile exists, no household" state.
 *
 * partial is NOT allowed for:
 *   - domain data failure
 *   - tasks/rewards/points load failure
 *   - household load failure
 *   - missing profile
 *
 * Throws if any invariant is violated.
 */
export function assertPartialHydrationContext(context: HydrationContext): void {
  if (!context.profile) {
    throw new Error('PartialHydrationContext: profile must exist.');
  }

  if (!context.hasNoHousehold) {
    throw new Error(
      'PartialHydrationContext: hasNoHousehold must be true for partial state.',
    );
  }
  if (context.household !== null) {
    throw new Error(
      'PartialHydrationContext: household must be null when hasNoHousehold is true.',
    );
  }
  if (context.activeHouseholdId !== null) {
    throw new Error(
      'PartialHydrationContext: activeHouseholdId must be null when hasNoHousehold is true.',
    );
  }
  if (context.tasks.length !== 0) {
    throw new Error(
      'PartialHydrationContext: tasks must be empty when hasNoHousehold is true.',
    );
  }
  if (context.rewards.length !== 0) {
    throw new Error(
      'PartialHydrationContext: rewards must be empty when hasNoHousehold is true.',
    );
  }
  if (context.pointsBalances.length !== 0) {
    throw new Error(
      'PartialHydrationContext: pointsBalances must be empty when hasNoHousehold is true.',
    );
  }
  if (context.contributionClaims.length !== 0) {
    throw new Error(
      'PartialHydrationContext: contributionClaims must be empty when hasNoHousehold is true.',
    );
  }
  if (context.memberProfiles.length !== 0) {
    throw new Error(
      'PartialHydrationContext: memberProfiles must be empty when hasNoHousehold is true.',
    );
  }
}

// ── Deterministic household ordering ─────────────────────────────────────────

/**
 * Returns a new sorted copy of household candidates using the deterministic rule:
 *   1. created_at ascending (earliest member first)
 *   2. id ascending as a tie-breaker (stable across identical timestamps)
 *
 * Repository ordering (e.g. .order('created_at')) is a performance and
 * DB-read-stability hint only. This function is the hydration layer's
 * authoritative sort — it must be called before active-household selection
 * even when repository ordering is in place, to guard against ordering
 * regressions in the repository layer.
 *
 * Does NOT mutate the input array.
 */
export function sortHouseholdCandidatesDeterministically<
  T extends { id: string; created_at?: string | null },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const msA = a.created_at ? Date.parse(a.created_at) : 0;
    const msB = b.created_at ? Date.parse(b.created_at) : 0;
    // Fall back to id comparison if both are 0 (missing/invalid dates).
    if (msA !== msB) return msA - msB;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// Roles defined by the household_members schema (T1.4.4).
// This union mirrors the DB check constraint — do not widen without a schema migration.
type KnownRole = 'owner' | 'admin' | 'adult' | 'child';

// ── Permission vocabulary ─────────────────────────────────────────────────────
//
// Each string names one UI or domain capability.
// Screens and components must never compare roles directly — always use
// hasHouseholdPermission or the permission selectors in selectors.ts.
//
// Contribution permissions (contributions.*):
//   These are vocabulary only in T1.6.1 — no contribution runtime flow exists yet.
//   The flow is implemented in T1.7.x (Contribution Claims Foundation).
//
//   Contribution ≠ Task:
//     A task is assigned and then completed (top-down).
//     A contribution is a completed action that a member reports and that
//     a household approves or rejects (bottom-up).
//
//   Claim ≠ Completion:
//     A claim is a member's request for credit on a completed contribution.
//     A completion is the final approved state after a claim is approved.
//     Children cannot award themselves points by submitting a claim — a claim
//     must be approved by an adult, admin, or owner before points are awarded.

export type HouseholdPermission =
  // Household management
  | 'household.manage'            // rename or delete the household — owner only
  | 'household.invite'            // invite new members
  | 'members.manage'              // remove members or change their roles

  // Tasks
  | 'tasks.create'                // create new tasks
  | 'tasks.assign'                // assign tasks to household members
  | 'tasks.complete'              // mark tasks complete

  // Rewards
  | 'rewards.create'              // create or edit rewards
  | 'rewards.redeem'              // redeem rewards (spend points)
  | 'requests.approve'            // approve point or reward requests

  // Contributions (vocabulary for T1.7.x — no runtime flow in T1.6.1)
  | 'contributions.create_completed'  // report a completed action for household approval
  | 'contributions.claim_completed'   // claim credit on a completed contribution (child-safe)
  | 'contributions.approve_claim'     // approve a submitted contribution claim
  | 'contributions.reject_claim';     // reject a submitted contribution claim

// ── Permission sets (hierarchy: owner ⊇ admin ⊇ adult ⊇ child) ──────────────
//
// Each set is built by spreading the next lower role's set and adding new permissions.
// This structurally enforces the superset hierarchy — no manual duplication required.

const CHILD_PERMISSIONS: readonly HouseholdPermission[] = [
  'tasks.complete',
  'rewards.redeem',
  'contributions.claim_completed',   // children can submit claims, but cannot self-approve
];

const ADULT_PERMISSIONS: readonly HouseholdPermission[] = [
  ...CHILD_PERMISSIONS,
  'tasks.create',
  'tasks.assign',
  'contributions.create_completed',  // adults can report completed contributions
  'contributions.approve_claim',     // adults can approve contribution claims
  'contributions.reject_claim',      // adults can reject contribution claims
];

const ADMIN_PERMISSIONS: readonly HouseholdPermission[] = [
  ...ADULT_PERMISSIONS,
  'household.invite',
  'members.manage',
  'rewards.create',
  'requests.approve',
];

const OWNER_PERMISSIONS: readonly HouseholdPermission[] = [
  ...ADMIN_PERMISSIONS,
  'household.manage',
];

// Shared empty set — returned for all deny-by-default cases.
// Never mutate this reference.
const EMPTY_PERMISSIONS: readonly HouseholdPermission[] = [];

const ROLE_PERMISSION_MAP: Record<KnownRole, readonly HouseholdPermission[]> = {
  owner: OWNER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  adult: ADULT_PERMISSIONS,
  child: CHILD_PERMISSIONS,
};

const KNOWN_ROLES = new Set<string>(['owner', 'admin', 'adult', 'child']);

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Returns the permission set for the given role.
 *
 * Deny-by-default: null, undefined, and unknown roles return an empty set.
 * Does not throw for any input — safe to call with any runtime string.
 *
 * Unknown roles (e.g. a new role added to the schema before the app is updated)
 * always receive zero permissions. They are never treated as any known role.
 */
export function getPermissionsForRole(
  role: string | null | undefined,
): readonly HouseholdPermission[] {
  if (role == null || !KNOWN_ROLES.has(role)) return EMPTY_PERMISSIONS;
  return ROLE_PERMISSION_MAP[role as KnownRole];
}

/**
 * Returns true if the given role has the specified permission.
 *
 * Deny-by-default: null, undefined, and unknown roles return false.
 * Does not throw for any input.
 */
export function hasHouseholdPermission(
  role: string | null | undefined,
  permission: HouseholdPermission,
): boolean {
  return (getPermissionsForRole(role) as readonly string[]).includes(permission);
}

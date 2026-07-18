# Household Roles and Permissions — T1.6.1

Domain invariant document for ChoreHero's MVP household role and permission model.
T1.6.1 adds the permission vocabulary and mapping only.
No runtime contribution flow, role editing, or member management UI is added here.

---

## Roles

Roles are defined by the `household_members.role` check constraint in the database schema (T1.4.4).
The TypeScript union `HouseholdMemberRole` mirrors this constraint exactly.

| Role    | Description                                               |
|---------|-----------------------------------------------------------|
| `owner` | Created the household. Full control over all permissions. |
| `admin` | Trusted manager. Can invite, manage members, and rewards. |
| `adult` | Standard member. Can create tasks, report contributions.  |
| `child` | Restricted member. Can complete tasks, claim contributions, redeem rewards. |

A user's role is assigned at join time (`role: 'adult'` for `joinHouseholdById`,
`role: 'owner'` for `createHouseholdWithOwner`) and stored in `household_members.role`.
Roles are committed into the Zustand store during hydration as `HouseholdMember.role`
inside `s.household.members`. Role editing is a follow-up concern (T1.6.3).

---

## Permission vocabulary

Each permission string names one UI or domain capability.

| Permission                       | Description                                              |
|----------------------------------|----------------------------------------------------------|
| `household.manage`               | Rename or delete the household                           |
| `household.invite`               | Invite new members to the household                      |
| `members.manage`                 | Remove members or change their roles                     |
| `tasks.create`                   | Create new tasks                                         |
| `tasks.assign`                   | Assign tasks to household members                        |
| `tasks.complete`                 | Mark tasks as complete                                   |
| `rewards.create`                 | Create or edit rewards                                   |
| `rewards.redeem`                 | Redeem rewards (spend points)                            |
| `requests.approve`               | Approve point or reward requests                         |
| `contributions.create_completed` | Report a completed contribution for household approval   |
| `contributions.claim_completed`  | Claim credit on a completed contribution                 |
| `contributions.approve_claim`    | Approve a submitted contribution claim                   |
| `contributions.reject_claim`     | Reject a submitted contribution claim                    |

---

## Permission mapping

| Permission                       | owner | admin | adult | child |
|----------------------------------|:-----:|:-----:|:-----:|:-----:|
| `household.manage`               |  ✓    |       |       |       |
| `household.invite`               |  ✓    |  ✓    |       |       |
| `members.manage`                 |  ✓    |  ✓    |       |       |
| `tasks.create`                   |  ✓    |  ✓    |  ✓    |       |
| `tasks.assign`                   |  ✓    |  ✓    |  ✓    |       |
| `tasks.complete`                 |  ✓    |  ✓    |  ✓    |  ✓    |
| `rewards.create`                 |  ✓    |  ✓    |  ✓    |       |
| `rewards.redeem`                 |  ✓    |  ✓    |  ✓    |  ✓    |
| `requests.approve`               |  ✓    |  ✓    |       |       |
| `contributions.create_completed` |  ✓    |  ✓    |  ✓    |       |
| `contributions.claim_completed`  |  ✓    |  ✓    |  ✓    |  ✓    |
| `contributions.approve_claim`    |  ✓    |  ✓    |  ✓    |       |
| `contributions.reject_claim`     |  ✓    |  ✓    |  ✓    |       |

---

## Permission hierarchy invariant

```
owner ⊇ admin ⊇ adult ⊇ child
```

- `owner` permissions are a superset of `admin` permissions
- `admin` permissions are a superset of `adult` permissions
- `adult` permissions are a superset of `child` permissions

This invariant is enforced **structurally** in `src/domain/permissions.ts`:
each role's permission set is built by spreading the next lower role's set
and adding new permissions. No set is manually duplicated.

No intentional deviation from this hierarchy exists in T1.6.1.

### Permission hierarchy checklist

```
[ ] owner includes all admin permissions
[ ] admin includes all adult permissions
[ ] adult includes all child permissions
[ ] unknown/null/undefined role has zero permissions
```

Verify by inspection of `src/domain/permissions.ts`:
`OWNER_PERMISSIONS` spreads `ADMIN_PERMISSIONS`,
`ADMIN_PERMISSIONS` spreads `ADULT_PERMISSIONS`,
`ADULT_PERMISSIONS` spreads `CHILD_PERMISSIONS`.

---

## Deny-by-default rule

The permission model is **deny-by-default**.

| Input            | `getPermissionsForRole` | `hasHouseholdPermission` |
|------------------|------------------------|--------------------------|
| `null`           | `[]` (empty)           | `false`                  |
| `undefined`      | `[]` (empty)           | `false`                  |
| `'guest'`        | `[]` (empty)           | `false`                  |
| any unknown string | `[]` (empty)`        | `false`                  |

Unknown roles (e.g. a new role added to the DB schema before the app is updated)
are never treated as any known role and never receive any permissions.
Helpers accept `string | null | undefined` and never throw.

---

## App permissions vs RLS

These are two separate, independent enforcement layers.

**App permissions** (this document):
- Enforced in the TypeScript domain layer (`src/domain/permissions.ts`)
- Drive UI affordances: show/hide buttons, enable/disable actions
- Client-side only — not a security boundary
- Purpose: UX correctness, not security

**Row Level Security (RLS)**:
- Enforced at the Supabase/PostgreSQL layer
- Enforces who can actually read or write data in the DB
- Server-side — the real security boundary
- App permissions cannot substitute for RLS

Both layers are required. App permissions control what the UI offers;
RLS enforces what the database permits.
T1.6.1 adds app permissions only. RLS is a separate concern managed in Supabase.

---

## Permission ownership chain

```
Hydration owns membership data
  ↓
s.household.members  (HouseholdMember[], committed by commitHydrationSnapshot)
  ↓
selectCurrentMemberRole  (finds current user's role in the member list)
  ↓
hasHouseholdPermission / getPermissionsForRole  (src/domain/permissions.ts)
  ↓
selectCan*  (permission selectors in src/store/selectors.ts)
  ↓
Screens / components  (consume boolean — no role comparisons in UI)
```

**Not allowed in UI code:**
```ts
if (role === 'owner') { ... }
if (role === 'admin' || role === 'owner') { ... }
```

**Allowed in UI code:**
```ts
const canManage = useAppStore(selectCanManageHousehold);
const canCreate = useAppStore(selectCanCreateTasks);
```
## Approval boundary — privileged roles vs review-required actions

Approval is a review mechanism, not a general permission check.

Permissions decide whether a member is allowed to perform an action.
Approval decides whether a submitted child/member action should be accepted by a trusted household role.

Privileged household roles (`owner`, `admin`, `adult`) do not need approval for their own management actions.

Examples of actions that do **not** require approval:

| Action | Reason |
|---|---|
| Adult creates a task | Adult is a trusted household manager |
| Adult assigns a task to a child | Assignment is a management action |
| Adult completes their own task | Privileged-role completion does not require review |
| Admin creates a reward | Reward creation is a management action |
| Owner manages household members | Owner is the top household authority |

Approval is reserved for child/member-submitted or review-required actions.

Examples of actions that **do** require approval:

| Action | Reason |
|---|---|
| Child marks a task as completed | Adult should verify completion before final approval |
| Member submits a contribution claim | Claim must be reviewed before points are awarded |
| Child requests reward redemption | Adult must approve before points are deducted and the reward is granted |

Implementation guardrail:

Do not introduce approval gates for `owner`, `admin`, or `adult` management actions unless the product explicitly changes this rule.

In particular:

- creating a task by an adult/admin/owner must not require approval
- assigning a task by an adult/admin/owner must not require approval
- completing a task by an adult/admin/owner must not require approval
- creating a reward by an adult/admin/owner must not require approval
- reward redemption approval applies to the child/member request, not to reward creation itself

---

## Contributions as a future product capability

### Contribution ≠ Task

A **task** is created by an adult/admin/owner and assigned top-down to a member.
Completion is recorded by the member who was assigned the task.

A **contribution** is a completed action that a member reports bottom-up.
It is submitted for household approval before credit (points) is awarded.
Contributions may represent chores done without being assigned, achievements, etc.

### Claim ≠ Completion

A **claim** (`contributions.claim_completed`) is a member's request for credit on
a contribution they say they completed. It is unverified.

A **completion** is the final approved state after a claim is reviewed and approved
by a member with `contributions.approve_claim`.

**Children cannot award themselves points through contribution claims.**
A child may submit a claim (`contributions.claim_completed`), but the claim does not
become a completion — and points are not awarded — until an adult, admin, or owner
approves it (`contributions.approve_claim`). The UI must never allow a child to
self-approve a contribution claim.

This vocabulary is added in T1.6.1 only. The runtime contribution flow
(claim creation, review UI, point award) is implemented in T1.7.x.

---

## Follow-up tickets

**T1.6.2 — Permission-aware UI affordances**
Apply `selectCan*` selectors to show/hide or disable UI elements based on the
current user's role. No role comparison logic in components.

**T1.6.3 — Invite & membership management permissions**
Implement the invite flow, role assignment UI, and member removal.
Uses `selectCanInviteMembers` and `selectCanManageMembers`.
A dedicated invite system is needed (the current `household.id` join code is a
foundation placeholder from T1.5.4).

**T1.6.4 — Task permission enforcement**
Enforce `tasks.create`, `tasks.assign`, and `tasks.complete` at the UI level.
Hide or disable task actions for roles without the relevant permission.

**T1.6.5 — Reward permission enforcement**
Enforce `rewards.create` and `rewards.redeem` at the UI level.
Approve/reject flows use `requests.approve`.

**T1.7.x — Contribution Claims Foundation**
Implement the full contribution claim lifecycle:
- Contribution claim creation UI (members with `contributions.create_completed` or `contributions.claim_completed`)
- Claim review UI (approve/reject for `contributions.approve_claim` / `contributions.reject_claim`)
- Point award on approval
- Children cannot self-approve claims
- Contribution ≠ Task distinction enforced in UI

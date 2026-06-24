# ChoreHero — RLS Strategy Draft

> Documentation only. No SQL policies have been implemented.
> This document guides T1.4.4 — Initial Migrations.
>
> Schema reference: `docs/schema-design.md`
> Domain reference: `docs/domain-model.md`

---

## Core Principles

### 1. RLS is the access boundary — not the business rule boundary

**RLS controls which rows a user can see or touch.**
RLS does not replace domain validation.

```
RLS answers:   "Is this user allowed to access this row?"
Domain rules answer: "Is this action valid given the current state?"
```

Both are needed. They operate at different layers and must not be confused.

**Business rules must still be enforced via:**
- Database constraints (check constraints, unique constraints, FKs)
- RPC / Postgres functions with `SECURITY DEFINER`
- Repository / service logic in the application layer
- Controlled write workflows (e.g. task completion, point awarding)

**Examples:**

> RLS may allow a child to update a task row they are assigned to,
> but domain validation must still prevent the child from reassigning
> that task to an adult. That rule belongs in the application or RPC layer,
> not in an RLS policy.

> RLS may allow an adult to write to household tasks,
> but task completion + point awarding must still happen through a
> controlled workflow to avoid inconsistent state (e.g. balance updated
> without a transaction row being written).

**Rule:** If a constraint is about *who can touch a row*, it belongs in RLS.
If it is about *what is a valid state*, it belongs in constraints, functions, or application logic.

---

### 2. Supabase Auth UID is the identity anchor

All RLS policies use `auth.uid()` as the identity of the requesting user.
`auth.uid()` maps to `profiles.id` (1:1 relationship by design).

```sql
-- Identity anchor
auth.uid() = profiles.id
```

Never assume a separate `user_id` column. Always join through `profiles` or `household_members`.

---

### 3. Household membership is the primary access gate

Most tables are household-scoped. Access to household data requires:
1. The requesting user has a row in `household_members` for that `household_id`
2. The user's `role` may further restrict create/update/delete operations

```sql
-- Membership check pattern
EXISTS (
  SELECT 1 FROM household_members hm
  WHERE hm.household_id = <table>.household_id
    AND hm.profile_id   = auth.uid()
)
```

This pattern is the foundation for nearly all household-scoped policies.

---

### 4. Role hierarchy

```
owner  > admin  > adult  > child
```

| Role | Description |
|---|---|
| `owner` | Created the household. Full control. |
| `admin` | Trusted adult with management rights. |
| `adult` | Standard adult member. Can approve requests. |
| `child` | Limited permissions. Cannot create tasks for adults directly. |

Roles are always household-scoped. The same profile may have different roles in different households.

---

### 5. MVP scope

For T1.4.4 Initial Migrations, RLS policies should be:
- **Enabled** on all tables
- **Conservative** — deny by default, allow explicitly
- **Minimal** — cover the essential access patterns; avoid complex policies that are hard to test

Full policy refinement can happen in later tickets as app features are built.

---

## RLS Helper Functions Draft

Helper functions reduce repetition across policies. The following are candidates for T1.4.4.

> **Important:** Only use helper functions when they do not cause recursive policy evaluation.
> A function that queries a table from within that table's own policy can cause infinite recursion
> or confusing policy dependency behavior. Prefer inline expressions where in doubt.

---

### `is_profile_self(profile_id uuid) → boolean`

```sql
CREATE OR REPLACE FUNCTION is_profile_self(profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT profile_id = auth.uid();
$$;
```

Safe: queries no table. Returns whether the given profile_id matches the caller.

---

### `is_household_member(household_id uuid) → boolean`

```sql
CREATE OR REPLACE FUNCTION is_household_member(household_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.household_id = $1
      AND hm.profile_id   = auth.uid()
  );
$$;
```

Safe: queries only `household_members`, not the table being protected.

---

### `has_household_role(household_id uuid, roles household_member_role[]) → boolean`

```sql
CREATE OR REPLACE FUNCTION has_household_role(
  household_id uuid,
  roles        household_member_role[]
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.household_id = $1
      AND hm.profile_id   = auth.uid()
      AND hm.role         = ANY($2)
  );
$$;
```

Safe: queries only `household_members`.

Usage example: `has_household_role(household_id, ARRAY['owner','admin','adult']::household_member_role[])`

---

### `is_task_assignee(task_id uuid) → boolean` ⚠️ Candidate only

> **Warning — use with caution.**
>
> This helper queries the `tasks` table. If used inside a policy on the `tasks` table itself,
> it may cause **recursive RLS evaluation**: the policy calls the function, the function reads
> `tasks`, which triggers the policy again.
>
> During SQL implementation, prefer **direct row-level expressions** instead:
> ```sql
> assignee_profile_id = auth.uid()
> ```
> This avoids the recursive dependency entirely.
>
> Only promote this to a shared helper if it is used on a *different* table
> (e.g. `task_help_requests`) where querying `tasks` does not create a cycle.

```sql
-- Candidate — do not use on tasks table policies directly
CREATE OR REPLACE FUNCTION is_task_assignee(task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id                 = $1
      AND t.assignee_profile_id = auth.uid()
  );
$$;
```

**Safer alternatives on the `tasks` table:**
- `is_household_member(household_id)` for read access
- `assignee_profile_id = auth.uid()` for assignee-specific writes
- `has_household_role(household_id, ...)` for role-based writes

---

## Role Permission Matrix

**Values:**
| Symbol | Meaning |
|---|---|
| `yes` | Allowed for all members of this role |
| `no` | Not allowed |
| `self` | Allowed only on own row / own assigned task / own request / own profile |
| `limited` | Allowed with restrictions based on role, relationship, or product decision |
| `open question` | Not yet decided; requires product/domain input |

---

### `profiles`

| Action | child | adult | admin | owner |
|---|---|---|---|---|
| Read own profile | self | self | self | self |
| Read other profiles in same household | yes | yes | yes | yes |
| Create profile | no (created at signup) | no | no | no |
| Update own profile | self | self | self | self |
| Update other profiles | no | no | limited | yes |
| Delete profile | no | no | no | open question |

---

### `households`

| Action | child | adult | admin | owner |
|---|---|---|---|---|
| Read own household | yes | yes | yes | yes |
| Create household | no | yes | yes | yes |
| Update household name/settings | no | no | yes | yes |
| Delete household | no | no | no | yes |

---

### `household_members`

| Action | child | adult | admin | owner |
|---|---|---|---|---|
| Read members of own household | yes | yes | yes | yes |
| Add member | no | no | yes | yes |
| Change member role | no | no | limited | yes |
| Remove member | no | no | limited | yes |
| Remove self (leave household) | self | self | self | open question |

---

### `tasks`

| Action | child | adult | admin | owner |
|---|---|---|---|---|
| Read household tasks | yes | yes | yes | yes |
| Create task | no | yes | yes | yes |
| Update task (all fields) | no | yes | yes | yes |
| Update own task status | self | self | yes | yes |
| Complete own assigned task | self | self | yes | yes |
| Assign task to others | no | yes | yes | yes |
| Delete task | no | no | yes | yes |

> **Domain note:** RLS allowing a child to update `status` on their assigned task does not mean
> the child can reassign the task. Field-level restrictions are enforced at the application/RPC layer.

---

### `rewards`

| Action | child | adult | admin | owner |
|---|---|---|---|---|
| Read active rewards | yes | yes | yes | yes |
| Read archived rewards | no | yes | yes | yes |
| Create reward | no | yes | yes | yes |
| Update reward | no | yes | yes | yes |
| Archive reward | no | yes | yes | yes |
| Delete reward | no | no | yes | yes |

---

### `points_balances`

| Action | child | adult | admin | owner |
|---|---|---|---|---|
| Read own balance | self | self | yes | yes |
| Read household balances | no | yes | yes | yes |
| Direct INSERT | no | no | no | no |
| Direct UPDATE | no | no | no | no |
| Direct DELETE | no | no | no | no |

> **MVP recommendation: No direct client UPDATE on `points_balances`.**
>
> See Points Balance section below.

---

### `point_transactions`

| Action | child | adult | admin | owner |
|---|---|---|---|---|
| Read own transactions | self | self | yes | yes |
| Read household transactions | no | yes | yes | yes |
| Insert transaction (direct) | no | no | no | no |
| Update/delete transaction | no | no | no | no |

> Transactions are immutable. All writes go through controlled workflows only.

---

### `service_requests`

| Action | child | adult | admin | owner |
|---|---|---|---|---|
| Read own requests | self | self | yes | yes |
| Read all household requests | no | yes | yes | yes |
| Create request | yes | yes | yes | yes |
| Cancel own request | self | self | yes | yes |
| Review / approve / decline | no | yes | yes | yes |
| Convert to task | no | yes | yes | yes |

---

### `task_help_requests`

| Action | child | adult | admin | owner |
|---|---|---|---|---|
| Read help requests for own tasks | self | self | yes | yes |
| Read all household help requests | no | yes | yes | yes |
| Create help request (own task) | self | self | yes | yes |
| Cancel own help request | self | self | yes | yes |
| Acknowledge / resolve | limited | yes | yes | yes |

---

## Points Balance Mutation Strategy

### MVP Rule: No direct client UPDATE on `points_balances`

All balance changes must originate from a **controlled workflow**:

```
Controlled write paths:
  Task completion  → RPC / backend function
                   → INSERT into point_transactions
                   → UPDATE points_balances atomically

  Manual adjustment → adult/admin triggers RPC
                    → INSERT into point_transactions (type = 'manual_adjustment', note required)
                    → UPDATE points_balances atomically

  Reward redemption → RPC / backend function
                    → INSERT into point_transactions (type = 'reward_redemption')
                    → UPDATE points_balances atomically
```

**Even admins and owners must not issue arbitrary `UPDATE points_balances SET balance = X` from the client.** This would bypass the audit trail and create inconsistent state between `points_balances` and `point_transactions`.

**Why this matters:**
- `points_balances` is the *current state*, derived from the transaction audit trail
- If balance is updated without a matching transaction, the history becomes unrecoverable
- Direct updates also bypass any constraint logic or notifications

**RLS policy implication:**
- `points_balances` should have **no UPDATE policy** for any client role in MVP
- Mutations happen via `SECURITY DEFINER` functions or backend service role

**For T1.4.4 Initial Migrations:**
The `points_balances` table may have read policies initially. Mutation policies are deferred until RPC/workflow layer is implemented. Document this explicitly in migration notes.

---

## Table-by-Table RLS Policy Sketch

> Sketch only — not final SQL. Confirms each table has been considered.

### `profiles`
```
ENABLE ROW LEVEL SECURITY;

-- Read: own profile always; other profiles if in same household
-- Update: own profile only
-- Insert: handled by auth trigger (future)
-- Delete: not allowed in MVP
```

### `households`
```
ENABLE ROW LEVEL SECURITY;

-- Read: member of household
-- Insert: any authenticated user (creates household)
-- Update: admin or owner
-- Delete: owner only
```

### `household_members`
```
ENABLE ROW LEVEL SECURITY;

-- Read: members of same household
-- Insert: admin or owner
-- Update: admin or owner (role changes)
-- Delete: admin or owner (or self = leave)
```

### `tasks`
```
ENABLE ROW LEVEL SECURITY;

-- Read: household member
-- Insert: adult, admin, owner
-- Update (all fields): adult, admin, owner
-- Update (status only): assignee (self) — enforced at app/RPC layer
-- Delete: admin, owner
```

### `rewards`
```
ENABLE ROW LEVEL SECURITY;

-- Read: household member (active); adult+ (archived)
-- Insert: adult, admin, owner
-- Update: adult, admin, owner
-- Delete: admin, owner
```

### `points_balances`
```
ENABLE ROW LEVEL SECURITY;

-- Read: own balance (child/adult self); all household balances (adult+)
-- Insert: no client insert — controlled workflow only
-- Update: no client update — controlled workflow only
-- Delete: not allowed
```

### `point_transactions`
```
ENABLE ROW LEVEL SECURITY;

-- Read: own transactions (child self); all household (adult+)
-- Insert: no client insert — controlled workflow only
-- Update: not allowed (immutable)
-- Delete: not allowed
```

### `service_requests`
```
ENABLE ROW LEVEL SECURITY;

-- Read: own requests (child self); all household (adult+)
-- Insert: any household member
-- Update (approve/decline/convert): adult, admin, owner
-- Update (cancel): requester (self)
-- Delete: not allowed
```

### `task_help_requests`
```
ENABLE ROW LEVEL SECURITY;

-- Read: own task requests (self); all household (adult+)
-- Insert: assignee of the referenced task (self)
-- Update (acknowledge/resolve): helper or adult+
-- Update (cancel): requester (self)
-- Delete: not allowed
```

---

## Open RLS Questions

| # | Question | Recommendation |
|---|---|---|
| 1 | Should profile creation be handled by an `auth` trigger or explicit client insert? | Auth trigger (future ticket). Client should not directly insert into `profiles`. |
| 2 | Should `points_balances` be writable via `SECURITY DEFINER` RPC in T1.4.4 or deferred? | Deferred until RPC layer (T1.4.6+). Read-only policies in T1.4.4. |
| 3 | Should `tasks` status updates by assignee use a separate restricted UPDATE policy or an RPC? | RPC preferred for MVP. Avoids field-level policy complexity. |
| 4 | Should adults be able to read all profiles in their household, or only members they are connected to? | All profiles in household (member read). Simplest for MVP. |
| 5 | Should `service_requests` be readable by all household members, or only the requester + adults? | All members in MVP. Simplifies queries; refine if privacy concerns arise. |
| 6 | Should `task_help_requests` be readable by all household members? | Yes for MVP. Adults need to see open help requests on Today screen. |
| 7 | Should `household_members` allow self-removal (leave household)? | Yes for adult/child. Owner leaving requires transfer or deletion logic — open question. |
| 8 | What is the minimum safe policy set for T1.4.4 migrations? | Enable RLS on all tables + read policies based on household membership. Write policies for tasks/service_requests. Defer points mutation policies. |

---

## Migration Sequencing Notes for RLS

1. Enable RLS on all tables in the same migration that creates them (never leave RLS off on a live table)
2. Create helper functions **before** the policies that use them
3. Apply read policies first; validate with test queries before adding write policies
4. Write policies for `points_balances` and `point_transactions` are deferred until controlled workflows exist
5. Test each policy with both a matching role and a non-matching role to confirm deny behavior

---

*Last updated: T1.4.3 — RLS Strategy (refined).*
*Next: T1.4.4 — Initial Migrations (conservative scope: schema + RLS enabled + minimum safe policies).*

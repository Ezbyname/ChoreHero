# ADR-002 — Open Task Claim RPC

> Status: **Accepted — implemented.** `public.claim_open_task` is live in
> `supabase/migrations/20260710000000_claim_open_task.sql`. This decision has
> been through architecture and security review (verdict: Ready to Merge) and
> is the canonical design record for the Open Task claim mutation. This
> document describes the decision as built — it does not propose any further
> implementation change.

---

## 1. Context

An Open Task is not a separate entity — it is a row in the existing `tasks`
table where `assignee_profile_id IS NULL`. The UI, selectors, and the
`FamilyActivity` adapter layer already supported *displaying* this state. The
one missing capability was letting an eligible household member claim one:
transition `assignee_profile_id` from `NULL` to their own profile id.

Two implementation shapes were evaluated:

- **Option A** — a repository-issued conditional `UPDATE`, authorized by a new
  RLS `UPDATE` policy on `tasks`.
- **Option B** — a single-purpose `SECURITY DEFINER` RPC that performs its own
  authorization internally, without any new RLS policy.

## 2. Decision

**Adopt Option B.** Open Task claiming is implemented as:

- `public.claim_open_task(p_task_id uuid)`
- `SECURITY DEFINER`
- `SET search_path = public`
- A direct, client-callable RPC — no `internal`-schema wrapper, no generic
  `UPDATE` endpoint of any kind.

This follows the one existing precedent for a client-callable
`SECURITY DEFINER` RPC already in this codebase, `public.redeem_household_invite`
(`supabase/migrations/20260706120000_household_invites.sql`):

- Client-callable RPCs live in `public`. `internal` stays reserved for
  RLS-policy-only helpers (`is_household_member`, `shares_household_with`)
  that are never invoked directly by client code — there is no
  public-wrapper/internal-implementation split anywhere in this project, and
  `claim_open_task` does not introduce one.
- Failure reporting uses `RAISE EXCEPTION ... USING ERRCODE = '...'`, the same
  convention `redeem_household_invite` already established, rather than a new
  discriminated-result-row return shape.

## 3. Why an RPC, Not a Broader `UPDATE` Grant

Row Level Security is row-level, not column-level. An RLS `UPDATE` policy can
restrict *which rows* a caller may write, but its `WITH CHECK` clause cannot
assert "and no other column was touched in this same request" — Postgres
policy expressions have no `OLD.column` comparison the way a trigger body
does. A policy permissive enough to let a caller flip `assignee_profile_id`
would, structurally, also permit that same request to carry `status`,
`points`, or `title` changes alongside it, as long as the one clause the
policy *can* check still passes.

A dedicated RPC avoids this by construction:

- **Atomic compare-and-swap** — the claim is one conditional `UPDATE`, not a
  read-then-write sequence coordinated by the client.
- **Single business operation** — the function does exactly one thing:
  "claim this task for me," not "update this task."
- **Narrow mutation scope** — the function body is the only thing that
  decides what gets written; there is no payload shape through which a
  caller could request a different column.
- **Protection of writable columns is structural, not policy-based** — the
  function signature accepts only `p_task_id`. There is nothing else for a
  client to send.
- **No broad `UPDATE` grant is introduced** — `tasks`' existing RLS policies
  (`tasks_update_adult_plus_or_assignee`, etc.) are untouched by this change.
- **Consistency with existing architecture** — same `SECURITY DEFINER` +
  `REVOKE EXECUTE FROM PUBLIC` / `GRANT EXECUTE TO authenticated` shape
  already used by `redeem_household_invite` and the `internal.*` RLS helpers.

## 4. RPC Contract

**Input:** `p_task_id` only. No other argument exists.

**Identity:** always derived from `auth.uid()` inside the function. The RPC
never accepts a target profile id — there is no way to claim a task on
someone else's behalf, structurally, not by convention.

**Mutation:** updates exactly one column, `assignee_profile_id`.

**Never modifies:**
- `status`
- completion (`completed_at`, `completed_by_profile_id`)
- rewards
- points
- contribution claims
- approvals
- notifications
- any other task field, including `updated_at` (this table has no
  auto-update trigger, so no column changes incidentally)

## 5. Authorization Model

The RPC authorizes on **household membership** —
`internal.is_household_member(v_task.household_id, v_caller)` — not on an
independently re-derived permission name.

This is correct today because of a specific, current project invariant:

```
Every current household role — child, adult, admin, owner — is allowed
to claim an Open Task.
```

Therefore, today:

```
household membership == claim permission
```

**This is an intentional invariant, not an automatically enforced
relationship.** `permissions.ts` (`tasks.claim_open`, granted to `child` and
inherited upward) and this RPC's membership check happen to agree today
because every existing role holds that permission. Nothing ties them
together structurally. If a future household role is introduced that should
*not* be able to claim Open Tasks (e.g. an observer/guest-style role), this
RPC's authorization check must be revisited in the same change that adds
that role to `permissions.ts` — updating one without the other will not
raise any error, it will silently leave the RPC more permissive than the
application's stated permission model.

## 6. State Transition Model

This RPC models **claimability**, not **ownership**. Its contract answers
exactly one question:

> Can this task transition from unclaimed to claimed by the authenticated
> user?

If yes: perform the assignment. Otherwise: return `CH001`.

The RPC intentionally does **not** distinguish:

- the task was already claimed by a different user, from
- the caller is already the assignee and is calling again

Both collapse to the same outcome: *the task is no longer claimable.* A
repeat call by the current assignee raises `CH001` exactly like a claim
attempt by anyone else would, and the client-facing message is the generic
"someone already took this" copy — including when "someone" is the caller
themselves. This is deliberate: distinguishing the two would mean growing
the RPC's authorization/state logic (and the error taxonomy below) to serve
a scenario the UI does not normally reach, since the claim affordance
disappears from a task the instant it becomes assigned. The only realistic
path to hitting this is a client retry after a lost response to an already
-successful call — functionally harmless (no duplicate write, no incorrect
state), just an imprecise message in a narrow, non-critical case. Kept small
and stable on purpose rather than solved preemptively.

## 7. Error Contract

**Success:** returns the updated task row.

**Failure:**
- `CH001` — the task is no longer claimable. The repository layer
  (`src/lib/repositories/tasks.ts`) forwards this code untouched; the
  execution layer (`src/features/tasks/claimOpenTask.ts`) is the only place
  that maps it to `already_claimed`.
- All other errors (not authenticated, task not found, caller not a
  household member) are treated as one generic failure (`'failed'`) unless a
  future product requirement explicitly needs to distinguish one of them.

No broader error taxonomy is introduced. No SQLSTATE parsing happens outside
the execution layer — UI components consume only the `ClaimOpenTaskResult`
union (`ok` / `not_authorized` / `already_claimed` / `failed`).

## 8. Race Handling

Correctness is guaranteed entirely by the atomic conditional `UPDATE`:

```sql
UPDATE tasks
SET assignee_profile_id = v_caller
WHERE id = p_task_id
  AND assignee_profile_id IS NULL
  AND status <> 'completed'
RETURNING * INTO v_task;
```

The `SELECT` that runs earlier in the function exists only to produce
specific, friendly error messages (not-found, not-a-member) before attempting
a mutation — it has no bearing on correctness and gates nothing. The `UPDATE`
above is the sole source of truth for the state transition, evaluated by
Postgres against the live row under its own row lock at write time.

First claimant's `UPDATE` commits. A concurrent second claimant's `UPDATE`
re-evaluates the same `WHERE` clause against the now-committed row, matches
zero rows, and the function raises `CH001`.

No advisory locks. No `SELECT ... FOR UPDATE`. No workflow engine. None are
needed — a single-statement compare-and-swap is sufficient for a single-column
state transition.

## 9. Scope Boundaries

This RPC is an assignment operation only. It does not, and must not be
extended to:

- complete tasks
- award points
- create `ContributionClaim`s
- create `HouseholdRequest`s
- trigger approvals
- trigger notifications
- publish events
- modify rewards
- change workflow state beyond assignment

## 10. Design Principles

- Small, business-specific RPCs over generic write APIs.
- Narrow mutation scope — one column, one operation.
- One responsibility per RPC.
- Keep database authorization simple — a single, explicit check, not a
  branching taxonomy.
- Keep application behavior deterministic — same input, same authorization
  state, same outcome, every time.
- Prefer explicit documentation (this ADR) over implicit convention — the
  simplicity of this function is exactly why it needs a written record: a
  one-column `UPDATE` is the kind of thing a future engineer reasonably asks
  "why isn't this just an `UPDATE`?" about, with no context for the answer
  unless it's written down.

## 11. Future Considerations (not implemented, not scoped here)

The following are intentionally separate slices. None of them should ever
expand the responsibility of `claim_open_task` — each is its own future RPC
or workflow, evaluated on its own merits when it's actually built:

- Open Task **completion** (a distinct mutation from claiming).
- A **points-award RPC** (points remain read-only/unwritable by any client
  path today — this is the blocking dependency for any feature that claims
  to award points, including a future completion flow).
- `ContributionClaim` workflow changes.
- Household Requests (a new, independent table — not a variant of `tasks`).
- Further `FamilyActivity` adapter expansion to cover the above once they
  exist.

---

*This ADR documents a decision that is already implemented, reviewed, and
accepted. No migration, schema, or application code change is proposed by
this document.*

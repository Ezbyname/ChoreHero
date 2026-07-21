# Task State Contract — EX-04

Design/documentation contract for the task lifecycle, written before EX-05
(adult completion), EX-06 (child completion request), EX-07 (parent approval
queue), and EX-10 (points integration) are implemented.

No code, RLS, migration, or UI change is proposed or made by this document.

---

## 1. Purpose

Define, once, the canonical task lifecycle — states, transitions, role
behavior, and the approval boundary — so EX-05/EX-06/EX-07/EX-10 implement
against a single agreed contract instead of each inventing its own
assumptions about what "complete" or "needs review" means.

---

## 2. Source-of-Truth States

Verified directly from schema, not assumed:

```sql
-- supabase/migrations/20260624000000_initial_schema.sql:24-29
CREATE TYPE task_status AS ENUM (
  'open',
  'in_progress',
  'needs_attention',
  'completed'
);
```

These 4 values are the only real database states. `tasks.status` defaults to
`'open'` (`20260624000000_initial_schema.sql:150`).

**Important finding**: `in_progress` is a real, defined DB value, but no code
path in this repository currently produces it:
- `insertTask` (`src/lib/repositories/tasks.ts:107-135`) never sets `status`
  — it always relies on the DB default (`'open'`), even when an assignee is
  provided at creation time.
- `claim_open_task` (`supabase/migrations/20260710000000_claim_open_task.sql`)
  updates only `assignee_profile_id`. Its own ADR (`docs/adr-002-open-task-claim-rpc.md:90-91`)
  explicitly lists `status` and completion columns (`completed_at`,
  `completed_by_profile_id`) as things structurally excluded from this RPC's
  reach — by design, not by omission.

So today, an assigned-but-not-yet-completed task's real DB status is `open`,
distinguished from an unassigned task only by whether `assignee_profile_id`
is null — `status` alone does not currently express "claimed vs unclaimed."

---

## 3. State Definitions

| State | Meaning |
|---|---|
| `open` | Active task — not completed, not awaiting review. **Not** strictly "unassigned": assignment/ownership is represented by `assignee_profile_id`, not by `status`. An assigned task may still have `status = open`; it is only `open`'s co-occurrence with a null `assignee_profile_id` that means "available to be claimed." |
| `in_progress` | Reserved DB value. **Currently unused** — see Decision D1 below for whether EX-05/EX-06 should start using it. |
| `needs_attention` | A completion was submitted by a role whose completion requires review, and is awaiting an adult/admin/owner decision. |
| `completed` | Terminal for normal flow. `completed_at`/`completed_by_profile_id` are set. |

---

## 4. Decision D1 — `in_progress` stays dormant for EX-05/EX-06/EX-07

**Accepted contract for EX-05/EX-06/EX-07 — not a recommendation pending confirmation.**

Given `claim_open_task` is explicitly, deliberately scoped to never touch
`status` (per its own ADR), and nothing else produces `in_progress` today,
this contract establishes that EX-05/EX-06/EX-07 **will not introduce
`open → in_progress`**:

- Adult/admin/owner direct completion: `open → completed`.
- Child completion request: `open → needs_attention`.
- Approval: `needs_attention → completed`.
- Rejection: `needs_attention → open`.

`in_progress` remains dormant for this first task-completion implementation
slice. This avoids inventing a one-off, asymmetric use of `in_progress` in a
single narrow transition, and requires zero changes to the already-accepted
`claim_open_task` RPC.

**Future use of `in_progress` requires a separate, explicitly approved
design change** — it must not be introduced incidentally as a side effect
of implementing EX-05/06/07, or by any later ticket without revisiting this
contract first.

---

## 5. Transition Table

| From | To | Actor | Allowed? | Approval? | Notes | Future EX |
|---|---|---|---|---|---|---|
| open | open (assignee set) | child/adult/admin/owner | yes | no | existing `claim_open_task` — status unchanged, only `assignee_profile_id` set | existing (unchanged) |
| open | completed | adult/admin/owner | yes | no | privileged direct completion, own or any task | EX-05 |
| open | needs_attention | child | yes | — (this *is* the submission) | child submits for review | EX-06 |
| needs_attention | completed | adult/admin/owner | yes | yes (this is the approval) | approve child completion | EX-07 |
| needs_attention | open | adult/admin/owner | yes | yes (this is the rejection) | reject; task returns to assigned/open, same assignee | EX-07 |
| completed | any | any | no | n/a | terminal; reopening explicitly out of scope | future, if ever |
| open → in_progress | — | — | not planned | n/a | see Decision D1 | none currently |

---

## 6. Role Behavior

**Owner/admin/adult** (privileged):
- Can create tasks — `tasks.create`, granted adult+ (`src/domain/permissions.ts`).
- Can assign tasks — `tasks.assign`, granted adult+.
- Can claim open tasks — `tasks.claim_open` is granted to **all** roles including child.
- Can complete tasks directly, no review — see §7.
- Can approve child completion requests — this is a review action, not a distinct permission today (see §8).
- Can reject child completion requests — same.

**Child:**
- Can claim open tasks — `tasks.claim_open` granted to child (`CHILD_PERMISSIONS`).
- Can complete an assigned task, but completion becomes a **request**, not a final state — see §7.
- Cannot approve or reject anything.
- Cannot move a task to `completed` directly under any circumstance.

**Important existing-permission finding**: `tasks.complete` is already
granted to **all four roles** (`CHILD_PERMISSIONS` includes it,
`src/domain/permissions.ts:56`). The privileged-vs-child distinction is
**not** a permission-level split — there is no separate
`tasks.complete_directly` vs `tasks.request_completion` permission. The
distinction must be implemented as role-based branching *inside* the future
completion feature function, after the single `tasks.complete` permission
check has already passed.

---

## 7. Open Task Claim Semantics (unchanged, documented for completeness)

- Claiming an open task assigns it to the actor (`assignee_profile_id` set to caller).
- Claiming does not complete the task.
- Claiming does not award points.
- Claiming does not create any approval/review record.
- Claiming does not transition `status` (see §2/§4 — this is existing, accepted behavior, not a gap to fix).
- Claiming remains self-claim only (`claim_open_task`'s RPC derives the claimant from `auth.uid()` itself — there is no way to claim on someone else's behalf). Not changed by this contract.

---

## 8. Completion Semantics

**Direct completion** (EX-05):
- Roles: owner, admin, adult.
- From status: `open` (see Decision D1 — never from `in_progress`, which isn't reached).
- Requires approval: no.
- Terminal: yes — sets `status = 'completed'`, `completed_at`, `completed_by_profile_id`.
- Applies whether the task is the privileged actor's own assignment or any other task in the household they're privileged in.

**Child completion request** (EX-06):
- Roles: child (also technically reachable by any role since `tasks.complete` is universal, but adult/admin/owner should route through direct completion instead — the completion feature function decides this by role, not by re-checking a different permission).
- From status: `open`.
- Goes to: `needs_attention`.
- Terminal: no — `needs_attention` is a pending-review state, not completion.
- Does **not** set `completed_at`. Does **not** set `completed_by_profile_id`. Neither column is touched by the submission itself; both remain null until (and unless) the request is later approved under EX-07 (see §9).
- Who approves: owner/admin/adult (EX-07).
- Who rejects: owner/admin/adult (EX-07).

**Reject behavior, stated explicitly:**
- `status` returns from `needs_attention` to `open`.
- `assignee_profile_id` remains unchanged.
- The task remains assigned to the same child/member — it is still theirs to retry.
- Rejection does **not** reopen the task to the whole household; it does not clear `assignee_profile_id`, so it never becomes claimable by anyone else as a side effect of a reject.

---

## 9. Parent Approval Queue Semantics (EX-07)

- `needs_attention` currently means, and should continue to mean, **only** task-completion review. It is not a general-purpose "flagged" state.
- Whether it later represents other attention-needed states is an explicit future decision, not assumed here — do not overload this value for unrelated purposes without revisiting this contract.
- Admin/adult should see: all household tasks currently in `needs_attention`, alongside the existing contribution-claims review section (`TodayScreen.tsx`'s `ContributionReviewSection` is the direct structural precedent to extend, not replace).
- Child should see: their own submitted-for-review tasks and their outcome once decided; not other members' pending reviews.
- On approve: `status → completed`, `completed_at`/`completed_by_profile_id` set (see the recommendation in §11 — `completed_by_profile_id` should be the child, not the approving adult).
- On reject: `status → open`, no completion columns set.

---

## 10. Points Integration Placeholder (not implemented here — for EX-10)

- Points are awarded only after approval (child path) or immediately on direct completion (privileged path) — in both cases, only once `status` reaches `completed`.
- No points on claim.
- No points on child submission (`needs_attention` is not a points event).
- No direct `points_balances`/`point_transactions` mutation from any task feature function — must go through the future ledger RPC (matches the existing, already-documented pattern: `contribution_claims` approval is deliberately deferred the same way today, per `approveContributionClaim.ts`'s own comment).
- Exact integration point: wherever `status` transitions to `completed` (both the direct-completion path in EX-05 and the approval path in EX-07) is where the future points RPC call belongs — EX-10's job, not this document's.

---

## 11. Terminal, Retry, and Idempotency Rules

- `completed` is terminal. Reopening a completed task is explicitly out of scope for EX-05/06/07.
- Double-approve / double-reject: the existing `contribution_claims` RLS pattern is the template to follow —
  `contribution_claims_update_review` (`supabase/migrations/20260704000000_contribution_claims_rls.sql:130-150`)
  scopes its `USING` clause to `status = 'pending'` only, so a second
  approve/reject attempt on an already-reviewed row is invisible to the
  policy and fails at the database level, not just the UI. EX-07's RLS
  should mirror this exactly: `USING (status = 'needs_attention')` on the
  review UPDATE.
- Double-submit (child clicking "mark done" twice): the same pattern applies
  from the other side — the completion-request UPDATE should be scoped to
  `USING (status = 'open')`, so a second submission attempt on an
  already-`needs_attention` task is rejected by RLS, not silently
  duplicated.
- **Recommendation (documented, not implemented here)**: `completed_by_profile_id`
  should represent the person who performed the work, not necessarily the
  adult who approved it.
  - Adult/admin/owner directly completes their own task → their own profile id.
  - Child submits a completion request and an adult approves it → the
    **child's** profile id, not the approving adult's.
  - If approval-reviewer tracking is separately required (e.g. "who
    approved this"), EX-07 should decide whether a dedicated
    review/approval field is needed rather than repurposing
    `completed_by_profile_id` for that — not implemented or decided here.

---

## 12. Legacy / Future-Only App Statuses

`src/types/task.ts:5-13`:
```ts
// DB task_status enum: open | in_progress | needs_attention | completed
// 'pending' and 'accepted' exist in the app type only (legacy / future states).
export type TaskStatus =
  | 'open' | 'pending' | 'accepted' | 'in_progress' | 'completed' | 'needs_attention';
```

- Real DB states: `open`, `in_progress` (defined but dormant — see D1), `needs_attention`, `completed`.
- App-only, not backed by any DB value: `pending`, `accepted`.
- These two app-only values already have a documented purpose elsewhere: they exist for `FamilyActivity`'s wider status vocabulary (`src/domain/adapters/taskActivityAdapter.ts`'s `STATUS_MAP` maps all 6 app-level values 1:1), not for `tasks.status` itself.
- **EX-05/EX-06/EX-07 must never write `'pending'` or `'accepted'` to `tasks.status`** — they are not valid enum values and would fail at the database constraint level. New code should only ever assign one of the 4 real DB states.

---

## 13. Explicit Out of Scope (this document and the EX items it feeds)

- Reopening a completed task.
- Any new DB enum value beyond the existing 4.
- Task reassignment / un-claiming.
- Multiple assignees per task (schema is single-`assignee_profile_id`, MVP by design per the table's own comment).
- Points ledger implementation (EX-10's job).
- Reward redemption, reward images, notifications, dashboard.
- Any change to `claim_open_task`'s existing behavior.
- Implementing the `completed_by_profile_id` recommendation (§11) or any separate approval-reviewer field — documented as guidance, not implemented here.

---

## 14. Implementation Mapping

| Contract section | Implementing EX item |
|---|---|
| Direct completion (§8) | EX-05 |
| Child completion request (§8) | EX-06 |
| Parent approval queue (§9) | EX-07 |
| Points integration (§10) | EX-10 |
| RLS idempotency pattern (§11) | EX-07 (and EX-05/06 for their own UPDATE policies) |
